import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { getWhaleWatch } from "@/lib/whales";

/**
 * Public, read-only demo account.
 *
 * Visitors without an account are signed into one shared demo user so they can
 * explore the whole product. The account:
 *  - is an ordinary `user` (never admin), so admin pages and APIs stay closed;
 *  - holds a complimentary Pro plan, so gated pages render;
 *  - cannot write anything: `guarded` API routes, the AI routes and the
 *    Better Auth account endpoints all reject it (see `isDemoUser` callers);
 *  - has a password derived from the server secret, never shown or stored in
 *    plain text, so nobody can sign in as it except through /demo.
 *
 * Turn the whole thing off by setting PUBLIC_DEMO=off.
 */
export const DEMO_EMAIL = "demo@edgewise.demo";
export const DEMO_NAME = "Demo viewer";
/** Non-secret marker cookie so the proxy lets a demo visitor reach sign-in / sign-up. */
export const DEMO_MARKER_COOKIE = "edgewise_demo";
export const DEMO_READ_ONLY_MESSAGE = "This is the public read-only demo. Create a free account to save your own data.";

export function isDemoEnabled(): boolean {
  return process.env.PUBLIC_DEMO !== "off";
}

export function isDemoUser(user: { email?: string | null } | null | undefined): boolean {
  return Boolean(user?.email && user.email.toLowerCase() === DEMO_EMAIL);
}

export function demoPassword(): string {
  if (!config.authSecret) throw new Error("BETTER_AUTH_SECRET is required for the public demo.");
  return createHmac("sha256", config.authSecret).update("edgewise-public-demo-v1").digest("base64url").slice(0, 40);
}

/** Pages a demo visitor may land on after /demo (never admin or account pages). */
export function demoNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/overview";
  if (raw === "/" || raw.startsWith("/admin") || raw.startsWith("/demo") || raw.startsWith("/sign-")) return "/overview";
  return raw;
}

/** Keep the demo user on Pro, out of email sequences, and its session table small. */
export async function prepareDemoUser(userId: string): Promise<void> {
  await db.subscription.upsert({
    where: { userId },
    create: { userId, tier: "pro", status: "active", source: "complimentary", grantNote: "public demo" },
    update: { tier: "pro", status: "active", source: "complimentary", currentPeriodEnd: null, grantNote: "public demo" },
  });
  await db.user.update({ where: { id: userId }, data: { role: "user" } });
  await db.emailSequenceState.deleteMany({ where: { userId } });
  // Sample follows: the top three traders from the latest real scan.
  if ((await db.watchlistItem.count({ where: { userId } })) === 0) {
    const leaders = (await getWhaleWatch())?.payload.leaderboard.slice(0, 3) ?? [];
    for (const l of leaders) {
      await db.watchlistItem.create({ data: { userId, kind: "wallet", refId: l.wallet.toLowerCase(), label: l.name } }).catch(() => undefined);
    }
  }
  // Every /demo visit makes a session; drop the ones older than a day.
  await db.session.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}
