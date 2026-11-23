import { apiError, guarded, json } from "@/lib/api";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { sendTelegram, unlinkTelegram } from "@/lib/telegram";

/** Send a clearly labelled test message to the member's linked chat, to confirm delivery works end to end. */
export const POST = guarded({ scope: "settings.telegram.test", limit: 5 }, async (ctx) => {
  if (!ctx.entitlements.limits.smartAlerts) return apiError("Telegram alerts are part of Pro.", 403);
  if (!config.isTelegramConfigured) return apiError("Telegram is not set up on this deployment yet.", 503);
  const prefs = await db.notificationPreference.findUnique({ where: { userId: ctx.user.id }, select: { telegramChatId: true } });
  if (!prefs?.telegramChatId) return apiError("Connect Telegram first.", 400);
  const sent = await sendTelegram(
    prefs.telegramChatId,
    "🧪 <b>Test from EDGEWISE.</b> Delivery works: your smart-money alerts will arrive in this chat.",
  );
  if (sent === "blocked") {
    await unlinkTelegram({ userId: ctx.user.id });
    return apiError("Telegram says the bot was blocked or the chat is gone, so it has been disconnected. Connect again to fix it.", 410);
  }
  if (sent !== "sent") return apiError("Telegram did not accept the message. Try again in a minute.", 502);
  return json({ ok: true, message: "Test sent. Check Telegram." });
});
