"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { leaderboardUrl, parseLeaderboard, type LeaderEntry, type LeaderboardPeriod } from "@/lib/data/providers/polymarket-whales";
import { boardSignature, indexByWallet, rankMoves } from "@/lib/live-board";
import { relative } from "@/lib/format";
import { SCAN_STALE_MS } from "./scan-freshness";

/**
 * Live ranks and profit for the leaderboard, read by the browser straight
 * from Polymarket's public leaderboard API (it allows any origin). Nothing
 * passes through our server, so the page can stay open all day without
 * costing a function call or waking the database.
 *
 * While the tab is visible: the top 50 and the hot board every FAST_MS, and
 * the whole top 1,000 (72 KB) only when the top 50 changed or every FULL_MS.
 * Hidden tabs stop polling and catch up the moment they are shown again.
 */
const FAST_MS = 2 * 60_000;
const FULL_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;
/**
 * Coming back to a tab whose scanned figures are this old reloads them once.
 * Scans run hourly, so a newer one has usually landed. Never on a timer: a
 * timer in a tab left open would keep waking the free-tier database.
 */
const RESCAN_RELOAD_MS = 65 * 60_000;
const RELOAD_GAP_MS = 15 * 60_000;

export type HotWindow = Exclude<LeaderboardPeriod, "ALL">;

export interface LiveBoard {
  /** The latest all-time board, by lowercase wallet. */
  board: Map<string, LeaderEntry> | null;
  /** The live top 50, in rank order. */
  top: LeaderEntry[] | null;
  /** The hot board for the window on screen; null until read for that window. */
  hot: LeaderEntry[] | null;
  checkedAt: number | null;
  status: "connecting" | "live" | "error";
  /** Places gained (positive) or lost since this page's first live read. */
  moved: Map<string, number>;
  /**
   * The latest update was the first live read, which replaces every scanned
   * figure at once: those land silently. Later changes sheen (CountUp).
   */
  quiet: boolean;
}

const Ctx = createContext<LiveBoard | null>(null);

/** The live board, or null outside a LiveBoardProvider (components then show the scan as rendered). */
export function useLiveBoard(): LiveBoard | null {
  return useContext(Ctx);
}

async function read(period: LeaderboardPeriod, n: number, signal: AbortSignal): Promise<LeaderEntry[]> {
  // No custom headers, so this is a simple request with no CORS preflight.
  const res = await fetch(leaderboardUrl(period, n), { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Polymarket answered ${res.status}`);
  const rows = parseLeaderboard(await res.json());
  if (!rows.length) throw new Error("Polymarket returned an empty leaderboard");
  return rows;
}

interface State extends Omit<LiveBoard, "hot"> {
  hot: { window: HotWindow; rows: LeaderEntry[] } | null;
}

const INITIAL: State = { board: null, top: null, hot: null, checkedAt: null, status: "connecting", moved: new Map(), quiet: true };

export function LiveBoardProvider({ hotWindow, scanGeneratedAt, children }: { hotWindow: HotWindow; scanGeneratedAt: string; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>(INITIAL);
  const hotWindowRef = useRef(hotWindow);
  const scanAtRef = useRef(scanGeneratedAt);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    scanAtRef.current = scanGeneratedAt;
  }, [scanGeneratedAt]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight: AbortController | null = null;
    let full: Map<string, LeaderEntry> | null = null;
    let fullAt = 0;
    let signature = "";
    let baseline: Map<string, LeaderEntry> | null = null;
    let failures = 0;
    let lastRun = 0;
    let lastReload = 0;

    async function tick() {
      inflight?.abort();
      const ctrl = new AbortController();
      inflight = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const win = hotWindowRef.current;
      try {
        const [top, hot] = await Promise.all([read("ALL", 50, ctrl.signal), read(win, 12, ctrl.signal).catch(() => null)]);
        // An unchanged top 50 means Polymarket has not recalculated the board, so the last full read
        // still stands; a changed one (or a stale full read) fetches the whole top 1,000 again.
        const sig = boardSignature(top);
        let board = full;
        if (!board || sig !== signature || Date.now() - fullAt > FULL_MS) {
          board = indexByWallet(await read("ALL", 1000, ctrl.signal));
          fullAt = Date.now();
        }
        if (!alive) return;
        full = board;
        signature = sig;
        baseline ??= board;
        failures = 0;
        const moved = rankMoves(baseline, board);
        setState((prev) => ({
          board,
          top,
          hot: hot ? { window: win, rows: hot } : prev.hot,
          checkedAt: Date.now(),
          status: "live",
          moved,
          quiet: prev.checkedAt === null,
        }));
      } catch {
        if (!alive || (ctrl.signal.aborted && inflight !== ctrl)) return;
        failures++;
        setState((prev) => ({ ...prev, status: "error" }));
      } finally {
        clearTimeout(timeout);
      }
    }
    tickRef.current = tick;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, ms));
    };
    async function run() {
      if (!alive || document.visibilityState !== "visible") return;
      lastRun = Date.now();
      await tick();
      if (alive) schedule(failures ? Math.min(MAX_BACKOFF_MS, FAST_MS * 2 ** (failures - 1)) : FAST_MS);
    }
    function onVisibility() {
      if (document.visibilityState !== "visible") {
        clearTimeout(timer);
        return;
      }
      const now = Date.now();
      if (now - Date.parse(scanAtRef.current) > RESCAN_RELOAD_MS && now - lastReload > RELOAD_GAP_MS) {
        lastReload = now;
        router.refresh();
      }
      schedule(FAST_MS - (now - lastRun));
    }

    document.addEventListener("visibilitychange", onVisibility);
    // Read right away: the ranks the server rendered are as old as the scan.
    schedule(0);
    return () => {
      alive = false;
      clearTimeout(timer);
      inflight?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  // A different hot window was picked: read it now rather than at the next tick.
  useEffect(() => {
    if (hotWindowRef.current === hotWindow) return;
    hotWindowRef.current = hotWindow;
    void tickRef.current?.();
  }, [hotWindow]);

  const value: LiveBoard = { ...state, hot: state.hot?.window === hotWindow ? state.hot.rows : null };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const CLOCK_MS = 15_000;
const subscribeClock = (onTick: () => void) => {
  const id = setInterval(onTick, CLOCK_MS);
  return () => clearInterval(id);
};
/**
 * A clock that ticks every 15 s so "checked 2 minutes ago" stays true. It
 * reads 0 on the server and during hydration, so the first render matches the
 * server's HTML exactly; real time takes over right after.
 */
function useClock(): number {
  return useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS, () => 0);
}

/**
 * The credibility line, live edition: when ranks and profit were last read
 * from Polymarket, and when the open bets were scanned. Until the first read
 * lands it is the plain scan line (ScanFreshness's look), so nothing claims to
 * be live before it is.
 *
 * `scanLabel` and `scanStale` are computed on the server and used for the
 * first render, so hydration sees exactly the server's text; after mount the
 * line keeps its own time.
 */
export function LiveBoardStatus({ scanGeneratedAt, scanLabel, scanStale }: { scanGeneratedAt: string; scanLabel: string; scanStale: boolean }) {
  const live = useLiveBoard();
  const now = useClock();
  const mounted = now > 0;
  const status = live?.checkedAt ? live.status : "connecting";
  const scanned = mounted ? relative(scanGeneratedAt) : scanLabel;
  const stale = mounted ? now - Date.parse(scanGeneratedAt) > SCAN_STALE_MS : scanStale;
  // The line ticks every 15 s, so counting seconds would only twitch.
  const checked = live?.checkedAt ? (now - live.checkedAt < 60_000 ? "just now" : relative(new Date(live.checkedAt))) : "";
  return (
    <div className="text-xs text-muted-foreground">
      {status === "connecting" || !live?.checkedAt ? (
        <p className="inline-flex items-center gap-2">
          {stale ? <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" /> : <span className="pulse-live shrink-0" aria-hidden="true" />}
          <span>
            <span className="text-foreground/85">Scanned {scanned}</span>
            {stale ? ` · older than ${SCAN_STALE_MS / 3_600_000} hours` : ""}
          </span>
        </p>
      ) : (
        <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {status === "live" ? <span className="pulse-live shrink-0" aria-hidden="true" /> : <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" />}
          <span title="Read from Polymarket's public leaderboard every 2 minutes while this tab is open. Polymarket recalculates the board itself, so a figure changes when it does.">
            {status === "live" ? (
              <>
                <span className="text-foreground/85">Live from Polymarket</span> · ranks and profit checked {checked}
              </>
            ) : (
              <>
                <span className="text-foreground/85">Can&apos;t reach Polymarket right now</span> · ranks and profit from {checked}, retrying
              </>
            )}
          </span>
          <span className={stale ? "text-status-warning" : undefined}>· open bets scanned {scanned}</span>
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {status === "live" ? "Live updates on." : status === "error" ? "Live updates paused: Polymarket could not be reached." : ""}
      </span>
    </div>
  );
}
