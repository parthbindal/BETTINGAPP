import { getApiContext } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, json } from "@/lib/api";
import { MANUAL_SCAN_GAP_MS, getScanAgeMs, getScanRun, scanIfDue } from "@/lib/whales";
import { logError } from "@/lib/ops";

// A full scan of 1,000 wallets takes ~60-90s; allow headroom.
export const maxDuration = 300;

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/**
 * Rescan the top traders' live positions now. Pro only. A rescan may run at
 * most every MANUAL_SCAN_GAP_MS across all members and servers: each one is
 * about 8 s of CPU, and Vercel Hobby allows 4 CPU-hours a month. Ranks and
 * profit never wait for a scan; the leaderboard reads those live.
 */
export async function POST() {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  if (!ctx.entitlements.limits.scanner) return apiError("Whale Watch is a Pro feature.", 402, { upgrade: true });
  if (!rateLimit(`whales.refresh:${ctx.user.id}`, 3, 60_000).ok) return apiError("A refresh was just run. Please wait a moment.", 429);
  try {
    const run = await scanIfDue(MANUAL_SCAN_GAP_MS);
    if (run.ran) return json({ ok: true, ...run.result, message: `Rescanned ${run.result.tradersScanned} traders and ${run.result.positionsScanned} live positions.` });

    const [state, age] = await Promise.all([getScanRun(), getScanAgeMs()]);
    const running = state && !state.finishedAt && Date.now() - state.startedAt.getTime() < 6 * 60_000;
    if (running) return json({ ok: true, skipped: true, message: "A scan is already running. It takes about a minute; reload then to see it." });
    return json({
      ok: true,
      skipped: true,
      message: `Positions were scanned ${age === null ? "recently" : `${minutes(age)} min ago`}. A rescan can run every ${minutes(MANUAL_SCAN_GAP_MS)} minutes; ranks and profit update live.`,
    });
  } catch (e) {
    await logError("api.whales.refresh", e);
    return apiError("Could not reach Polymarket to refresh right now. The last snapshot is still shown.", 502);
  }
}
