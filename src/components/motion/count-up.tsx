"use client";

import { useEffect, useRef } from "react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** How the number is printed. A key, not a function, so server components can pass it. */
export type CountFormat = "int" | "usd" | "compact";

function format(kind: CountFormat, n: number): string {
  if (kind === "usd") return `$${compact(n)}`;
  if (kind === "compact") return compact(n);
  return Math.round(n).toLocaleString("en-US");
}

const DURATION_MS = 600;
const EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)"; // --ease-out-soft
// Numbers that already counted up this session. Coming back to a page shows them settled.
const seen = new Set<string>();

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Drive the text of `el` from `from` to `to`, timed by the Web Animations API. */
function run(el: HTMLElement, from: number, to: number, kind: CountFormat): () => void {
  const timer = el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: DURATION_MS, easing: EASING });
  let raf = 0;
  const tick = () => {
    const p = Number(timer.effect?.getComputedTiming().progress ?? 1);
    if (timer.playState === "finished" || !Number.isFinite(p)) {
      el.textContent = format(kind, to);
      return;
    }
    el.textContent = format(kind, from + (to - from) * p);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    timer.cancel();
    el.textContent = format(kind, to);
  };
}

/**
 * A figure that counts up to its value the first time it scrolls into view,
 * and sheens + counts between values when a refresh changes it. The server
 * renders the final value, so the number is correct before any script runs,
 * with reduced motion, and for screen readers (aria-label holds it too).
 */
export function CountUp({ value, format: kind = "int", id, className }: { value: number; format?: CountFormat; id?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = shown.current;
    shown.current = value;

    // A later value: shimmer once and count from the old figure (Stage 4 "never flash-replace").
    if (previous !== null && previous !== value) {
      if (reducedMotion()) return;
      el.classList.remove("shimmer");
      void el.offsetWidth; // restart the one-shot sheen
      el.classList.add("shimmer");
      return run(el, previous, value, kind);
    }
    if (previous !== null) return;

    // First observation only.
    const key = id ? `${id}:${value}` : null;
    if (reducedMotion() || (key && seen.has(key))) return;
    let stop: (() => void) | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (key) seen.add(key);
        stop = run(el, 0, value, kind);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop?.();
    };
  }, [value, kind, id]);

  return (
    <span ref={ref} className={cn("count-up", className)}>
      {format(kind, value)}
    </span>
  );
}
