import { apiError, guarded, json } from "@/lib/api";
import { config } from "@/lib/env";
import { createTelegramLink, unlinkTelegram } from "@/lib/telegram";

/** Start connecting Telegram: returns a one-time t.me link (valid 15 minutes) the member opens and taps Start on. */
export const POST = guarded({ scope: "settings.telegram", limit: 10 }, async (ctx) => {
  if (!ctx.entitlements.limits.smartAlerts) return apiError("Telegram alerts are part of Pro.", 403);
  if (!config.isTelegramConfigured) return apiError("Telegram is not set up on this deployment yet.", 503);
  const url = await createTelegramLink(ctx.user.id);
  if (!url) return apiError("Telegram is not set up on this deployment yet.", 503);
  return json({ url, message: "Opening Telegram. Tap Start there to finish." });
});

/** Disconnect Telegram. Available on every plan, so a downgraded member can always clean up. */
export const DELETE = guarded({ scope: "settings.telegram", limit: 10 }, async (ctx) => {
  await unlinkTelegram({ userId: ctx.user.id });
  return json({ ok: true, message: "Telegram disconnected" });
});
