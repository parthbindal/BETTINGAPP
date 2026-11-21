import { after } from "next/server";
import { db } from "@/lib/db";
import { bootstrapMarkets, getSyncState, refreshHotMarkets, syncMarkets } from "@/lib/data/markets";
import { logError } from "@/lib/ops";

const FULL_SCAN_STALE_MS = 45 * 60_000;
const HOT_STALE_MS = 4 * 60_000;

/** Run after the response is sent; falls back to a detached promise outside a request. */
function background(task: () => Promise<unknown>, scope: string) {
  const run = () => task().catch((e) => logError(scope, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Keep the market cache fresh without ever blocking a page on the full scan.
 * Scheduled jobs (see README) are the primary mechanism; this is the safety
 * net for local development and for deployments where a job was missed.
 */
export async function ensureMarketsFresh() {
  const [count, state] = await Promise.all([db.market.count({ where: { source: "kalshi" } }), getSyncState()]);
  if (count === 0) {
    // Brand-new deployment: load what is trading right now, then scan everything in the background.
    await bootstrapMarkets().catch((e) => logError("markets.bootstrap", e));
    background(() => syncMarkets(), "markets.sync.background");
    return;
  }
  const now = Date.now();
  if (!state.lastFullScanAt || now - state.lastFullScanAt.getTime() > FULL_SCAN_STALE_MS) {
    background(() => syncMarkets(), "markets.sync.background");
  } else if (!state.lastHotRefreshAt || now - state.lastHotRefreshAt.getTime() > HOT_STALE_MS) {
    background(() => refreshHotMarkets(), "markets.hot.background");
  }
}
