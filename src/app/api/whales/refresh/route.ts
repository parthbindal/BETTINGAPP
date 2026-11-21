import { getApiContext } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, json } from "@/lib/api";
import { syncWhaleWatch, getWhaleWatch } from "@/lib/whales";
import { logError } from "@/lib/ops";

// A full scan of 1,000 wallets takes ~60-90s; allow headroom.
export const maxDuration = 300;

/** Force an immediate, accurate re-scan of the top traders' live positions. Pro only. */
export async function POST() {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  if (!ctx.entitlements.limits.scanner) return apiError("Whale Watch is a Pro feature.", 402, { upgrade: true });
  // At most a few manual refreshes per minute per user; concurrent syncs coalesce server-side anyway.
  if (!rateLimit(`whales.refresh:${ctx.user.id}`, 3, 60_000).ok) return apiError("A refresh was just run. Please wait a moment.", 429);
  try {
    const res = await syncWhaleWatch({ topN: 1000 });
    const latest = await getWhaleWatch();
    return json({ ok: true, ...res, generatedAt: latest?.payload.generatedAt ?? null, message: `Rescanned ${res.tradersScanned} traders and ${res.positionsScanned} live positions.` });
  } catch (e) {
    await logError("api.whales.refresh", e);
    return apiError("Could not reach Polymarket to refresh right now. The last snapshot is still shown.", 502);
  }
}
