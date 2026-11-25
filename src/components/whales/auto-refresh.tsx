"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const POLL_MS = 15_000;
/** A scan takes about a minute; give up quietly after four. */
const MAX_POLLS = 16;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps the app current without anyone pressing "Refresh now". When a member
 * opens the app, or comes back to its tab, it asks the server to rescan if the
 * data is 30+ minutes old. If a scan is on its way, it waits for it (a small
 * read every 15 s, at most 16 times) and re-renders the page with the new
 * numbers when it lands.
 *
 * It never polls on a timer while the tab simply sits open: each status read
 * wakes the database, and Neon Free's compute hours are the tightest limit
 * this app has (see the free-tier notes in lib/whales.ts).
 */
export function AutoRefresh() {
  const router = useRouter();
  const busy = useRef(false);
  // "Still on screen", shared across effect runs. A per-run `cancelled` flag broke this: React mounts
  // effects twice in development (and may re-run them), so the first run, the one already waiting for
  // the scan, was cancelled at once while `busy` kept the second from starting. The wait never happened.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    async function check() {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      let t: string | number | undefined;
      try {
        const res = await fetch("/api/whales/auto-refresh", { method: "POST" });
        if (!res.ok) return;
        const start = (await res.json()) as { refreshing?: boolean; generatedAt?: string | null };
        if (!start.refreshing) return;
        t = toast.loading("Getting the latest from Polymarket…", { description: "Reading the top 1,000 traders. About a minute; keep browsing." });
        for (let i = 0; i < MAX_POLLS && alive.current; i++) {
          await sleep(POLL_MS);
          if (!alive.current) break;
          const s = (await fetch("/api/whales/auto-refresh")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)) as { generatedAt?: string | null; running?: boolean } | null;
          if (s?.generatedAt && s.generatedAt !== start.generatedAt) {
            router.refresh();
            toast.success("Updated with the latest from Polymarket", { id: t, description: "The figures on this page were just read again." });
            t = undefined;
            return;
          }
          // Nothing running and nothing new after a few checks: the scan was skipped or failed. The page keeps its data.
          if (s && !s.running && i >= 3) break;
        }
      } catch {
        // Offline or the server is busy: the page simply keeps the data it has.
      } finally {
        if (t !== undefined) toast.dismiss(t);
        busy.current = false;
      }
    }

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
