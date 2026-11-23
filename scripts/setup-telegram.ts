/**
 * One-command Telegram setup for smart-money alerts.
 *
 *   npm run telegram:setup -- --url https://your-site.example
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and (optionally)
 * TELEGRAM_CHANNEL_ID from .env, then:
 *   1. checks the bot token and prints the bot's @username (TELEGRAM_BOT_USERNAME),
 *   2. points the bot's webhook at <url>/api/telegram/webhook with the secret,
 *   3. checks the bot can post in the public channel (it must be an admin there).
 * Idempotent: run it again any time, for example after changing domains.
 * `--url` defaults to NEXT_PUBLIC_APP_URL. Telegram only calls https URLs, so
 * a localhost app cannot receive the webhook (use the deployed site).
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const channel = process.env.TELEGRAM_CHANNEL_ID ?? "";
const argUrl = (() => {
  const i = process.argv.indexOf("--url");
  return i > -1 ? process.argv[i + 1] : undefined;
})();
const base = (argUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

async function tg<T>(method: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: T; description?: string }> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; result?: T; description?: string };
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function main() {
  if (!token) fail("TELEGRAM_BOT_TOKEN is missing. Create a bot with @BotFather and put its token in .env.");
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(secret)) fail("TELEGRAM_WEBHOOK_SECRET is missing or invalid: use 24+ letters, digits, _ or - (for example: openssl rand -hex 24).");
  if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base)) fail(`Need the public https address of the site (got "${base || "nothing"}"). Pass --url https://your-site.example`);

  const me = await tg<{ id: number; username: string }>("getMe");
  if (!me.ok || !me.result) fail(`The bot token was rejected: ${me.description ?? "unknown error"}`);
  console.log(`✓ Bot: @${me.result.username}`);
  if ((process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "") !== me.result.username) console.log(`  ! Set TELEGRAM_BOT_USERNAME="${me.result.username}" (in .env and on the host)`);

  const hook = `${base}/api/telegram/webhook`;
  const set = await tg("setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  if (!set.ok) fail(`setWebhook failed: ${set.description ?? "unknown error"}`);
  console.log(`✓ Webhook: ${hook}`);

  if (channel) {
    const chat = await tg<{ title?: string }>("getChat", { chat_id: channel });
    if (!chat.ok) console.log(`  ! Channel ${channel}: ${chat.description ?? "not found"}. Add the bot to the channel as an admin.`);
    else {
      const member = await tg<{ status: string; can_post_messages?: boolean }>("getChatMember", { chat_id: channel, user_id: me.result.id });
      const canPost = member.result?.status === "creator" || (member.result?.status === "administrator" && member.result.can_post_messages !== false);
      console.log(canPost ? `✓ Channel: ${chat.result?.title ?? channel} (bot can post)` : `  ! Channel ${chat.result?.title ?? channel}: make the bot an admin with "Post messages".`);
    }
  } else console.log("  - No TELEGRAM_CHANNEL_ID: the free public channel is off (Pro alerts still work).");

  const info = await tg<{ pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
  if (info.result?.last_error_message) console.log(`  ! Telegram's last delivery error: ${info.result.last_error_message}`);
  console.log("\nDone. The host needs the same TELEGRAM_* values (then redeploy). Members connect under Settings → Notifications.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
