"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { usd, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HeroPick {
  statement: string;
  outcome: string;
  pnl: number;
  holders: number;
  field: number;
  avgEntryPct: number;
  currentPct: number;
  url: string;
  category: string;
}

/** Swipeable / arrow-navigable hero showing each top pick the whales are making. */
export function WhaleHeroCarousel({ picks }: { picks: HeroPick[] }) {
  const [i, setI] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  if (!picks.length) return null;
  const n = picks.length;
  const go = (d: number) => setI((prev) => (prev + d + n) % n);
  const h = picks[i]!;
  const up = h.pnl >= 0;

  return (
    <div
      className="card-surface glow-primary relative overflow-hidden"
      onTouchStart={(e) => setTouchX(e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0]!.clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      <div className="flex items-stretch">
        <button type="button" onClick={() => go(-1)} aria-label="Previous pick" className="group flex shrink-0 items-center px-1 text-muted-foreground hover:text-foreground sm:px-2">
          <ChevronLeft className="size-6" />
        </button>

        <div className="min-w-0 flex-1 py-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-primary">What the top earners are making money on</div>
            <div className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{h.category}</div>
          </div>
          <p className="mt-2 text-balance text-xl font-semibold leading-snug sm:text-2xl">{h.statement}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The top {compact(h.field)} traders are collectively{" "}
            <span className={cn("inline-flex items-center gap-1 font-semibold", up ? "text-status-good" : "text-status-critical")}>
              {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {up ? "up " : "down "}
              {usd(Math.abs(h.pnl), 0)}
            </span>{" "}
            on this. {h.holders} of them hold it — bought around {h.avgEntryPct}¢, now {h.currentPct}¢.
          </p>
          <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Their position:</span>
            <span className="font-semibold">&quot;{h.outcome}&quot; at {h.currentPct}¢</span>
            <span className="text-muted-foreground">on Polymarket</span>
            <a href={h.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              open <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <button type="button" onClick={() => go(1)} aria-label="Next pick" className="group flex shrink-0 items-center px-1 text-muted-foreground hover:text-foreground sm:px-2">
          <ChevronRight className="size-6" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-border/50 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          Pick {i + 1} of {n} · swipe or use arrows
        </span>
        <div className="flex gap-1.5">
          {picks.map((_, idx) => (
            <button key={idx} type="button" aria-label={`Go to pick ${idx + 1}`} onClick={() => setI(idx)} className={cn("size-1.5 rounded-full transition-colors", idx === i ? "bg-primary" : "bg-surface-3 hover:bg-muted-foreground/50")} />
          ))}
        </div>
      </div>
    </div>
  );
}
