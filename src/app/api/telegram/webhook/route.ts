import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/env";
import { logError } from "@/lib/ops";
import { parseBotCommand } from "@/lib/smart-alerts-core";
import { linkTelegramChat, sendTelegram, unlinkTelegram } from "@/lib/telegram";

/**
 * Telegram bot webhook. Telegram signs every call with the secret registered
 * by `npm run telegram:setup` (X-Telegram-Bot-Api-Secret-Token); anything
 * without it is refused. Only private chats are handled: "/start <token>"
 * links the chat to the member who generated the token in Settings, "/stop"
 * unlinks it. Always answers 200 for valid calls, since Telegram retries
 * anything else.
 */

function secretMatches(got: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(config.telegramWebhookSecret);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

const settingsUrl = () => `${config.appUrl.replace(/\/$/, "")}/settings/notifications`;

const COPY = {
  connected: "✅ <b>Connected.</b> Smart-money alerts from EDGEWISE will arrive here.\n\nChoose which trades you hear about in Settings → Notifications. Send /stop to disconnect.",
  expired: () => `That link has expired or was already used. Open <a href="${settingsUrl()}">Settings → Notifications</a> and tap <b>Connect Telegram</b> again.`,
  howTo: () => `To get alerts here, open <a href="${settingsUrl()}">EDGEWISE → Settings → Notifications</a> and tap <b>Connect Telegram</b>.`,
  stopped: () => `Disconnected. You will not get alerts here any more. Reconnect any time from <a href="${settingsUrl()}">Settings</a>.`,
};

interface TgUpdate {
  message?: { text?: string; chat?: { id?: number | string; type?: string }; from?: { username?: string } };
}

export async function POST(req: Request) {
  if (!config.isTelegramConfigured) return new Response("Not found", { status: 404 });
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token") ?? "")) return new Response("Forbidden", { status: 401 });
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: true });
  }
  const msg = update.message;
  if (!msg?.chat?.id || msg.chat.type !== "private" || typeof msg.text !== "string") return Response.json({ ok: true });
  const chatId = String(msg.chat.id);
  const cmd = parseBotCommand(msg.text);
  try {
    if (cmd.kind === "start" && cmd.token) {
      const linked = await linkTelegramChat(cmd.token, chatId, msg.from?.username ?? null);
      await sendTelegram(chatId, linked ? COPY.connected : COPY.expired());
    } else if (cmd.kind === "stop") {
      await unlinkTelegram({ chatId });
      await sendTelegram(chatId, COPY.stopped());
    } else {
      await sendTelegram(chatId, COPY.howTo());
    }
  } catch (e) {
    await logError("telegram.webhook", e);
  }
  return Response.json({ ok: true });
}
