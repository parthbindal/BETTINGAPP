import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { config } from "@/lib/env";

/**
 * Telegram delivery for smart-money alerts: a small Bot API client plus the
 * account link. Members connect by tapping a one-time t.me link that carries
 * a short-lived token; the bot receives "/start <token>" on the webhook and
 * ties that private chat to the member. The bot token is never logged (it is
 * part of every API URL).
 */

const API = "https://api.telegram.org";
const LINK_TTL_MS = 15 * 60_000;

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<TgResponse<T>> {
  if (!config.telegramBotToken) return { ok: false, description: "Telegram is not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${API}/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    return (await r.json()) as TgResponse<T>;
  } catch {
    return { ok: false, description: `Telegram ${method} request failed` };
  } finally {
    clearTimeout(timer);
  }
}

/** "blocked" means the member stopped or blocked the bot: the caller unlinks them rather than retrying forever. */
export async function sendTelegram(chatId: string, html: string): Promise<"sent" | "blocked" | "failed"> {
  const r = await telegramApi("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  if (r.ok) return "sent";
  if (r.error_code === 403 || (r.error_code === 400 && /chat not found/i.test(r.description ?? ""))) return "blocked";
  return "failed";
}

/** Public link to the free channel, when it has a public @username. */
export function channelUrl(): string | null {
  const id = config.telegramChannelId.trim();
  return id.startsWith("@") ? `https://t.me/${id.slice(1)}` : null;
}

/** A fresh one-time link for this member; replaces any earlier unused one. */
export async function createTelegramLink(userId: string): Promise<string | null> {
  if (!config.isTelegramConfigured) return null;
  const token = randomBytes(16).toString("base64url");
  const expires = new Date(Date.now() + LINK_TTL_MS);
  await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, telegramLinkToken: token, telegramLinkExpiresAt: expires },
    update: { telegramLinkToken: token, telegramLinkExpiresAt: expires },
  });
  return `https://t.me/${config.telegramBotUsername}?start=${token}`;
}

/** Bind a private chat to whoever owns this link token. A chat can belong to one member only. */
export async function linkTelegramChat(token: string, chatId: string, username: string | null): Promise<boolean> {
  const pref = await db.notificationPreference.findUnique({ where: { telegramLinkToken: token } });
  if (!pref?.telegramLinkExpiresAt || pref.telegramLinkExpiresAt.getTime() < Date.now()) return false;
  await db.$transaction([
    db.notificationPreference.updateMany({ where: { telegramChatId: chatId, NOT: { userId: pref.userId } }, data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null } }),
    db.notificationPreference.update({
      where: { userId: pref.userId },
      data: { telegramChatId: chatId, telegramUsername: username, telegramLinkedAt: new Date(), telegramLinkToken: null, telegramLinkExpiresAt: null },
    }),
  ]);
  return true;
}

export async function unlinkTelegram(where: { userId: string } | { chatId: string }): Promise<void> {
  await db.notificationPreference.updateMany({
    where: "userId" in where ? { userId: where.userId } : { telegramChatId: where.chatId },
    data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null, telegramLinkToken: null, telegramLinkExpiresAt: null },
  });
}
