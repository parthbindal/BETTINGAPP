import { getApiContext } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, json } from "@/lib/api";
import { getScanStatus, refreshOnOpen } from "@/lib/whales";
import { logError } from "@/lib/ops";

// The scan runs after the response (see refreshOnOpen) inside this invocation; a scan takes about a minute.
export const maxDuration = 300;

/**
 * Called by <AutoRefresh> when a signed-in member opens the app or returns to
 * its tab. Starts a background rescan if the data is 30+ minutes old (the
 * global claim in scanIfDue caps scans at two an hour, whoever asks), and
 * answers at once so nobody waits on it.
 */
export async function POST() {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  // Tab switching can fire this often; a few a minute per member is plenty.
  if (!rateLimit(`whales.open:${ctx.user.id}`, 4, 60_000).ok) return json({ refreshing: false, throttled: true });
  try {
    return json(await refreshOnOpen());
  } catch (e) {
    await logError("api.whales.autoRefresh", e);
    return json({ refreshing: false });
  }
}

/** Polled every 15 s while a refresh is on its way: has a newer scan landed yet? */
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  try {
    return json(await getScanStatus());
  } catch (e) {
    await logError("api.whales.scanStatus", e);
    return apiError("Status unavailable.", 503);
  }
}
