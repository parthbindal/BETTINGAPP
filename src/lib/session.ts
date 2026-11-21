import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, isTier, type Tier, type PlanLimits } from "@/lib/subscriptions/plans";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireUser(nextPath?: string) {
  const session = await getSession();
  if (!session) redirect(`/sign-in${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return session;
}

export async function requireAdmin() {
  const session = await requireUser("/admin");
  if (session.user.role !== "admin") redirect("/overview");
  return session;
}

export interface Entitlements {
  tier: Tier;
  status: string;
  source: string;
  limits: PlanLimits;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Resolve a user's effective plan (active Stripe or complimentary grant; otherwise free). */
export const getEntitlements = cache(async (userId: string): Promise<Entitlements> => {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const overrides = await db.featureLimitOverride.findMany();
  const activeStatuses = new Set(["active", "trialing", "past_due"]);
  let tier: Tier = "free";
  if (sub && isTier(sub.tier) && activeStatuses.has(sub.status)) {
    // Complimentary grants end exactly at their expiry; Stripe plans follow Stripe's status.
    const expired = sub.source === "complimentary" && sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() < Date.now();
    tier = expired ? "free" : sub.tier;
  }
  const limits: PlanLimits = { ...PLANS[tier].limits };
  for (const o of overrides) {
    const [t, key] = o.key.split(".");
    if (t === tier && key && key in limits) {
      (limits as unknown as Record<string, unknown>)[key] = o.value as unknown;
    }
  }
  return {
    tier,
    status: sub?.status ?? "active",
    source: sub?.source ?? "none",
    limits,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
});

/** API-route helper: returns session + entitlements or null. */
export async function getApiContext() {
  const session = await getSession();
  if (!session) return null;
  const entitlements = await getEntitlements(session.user.id);
  return { session, user: session.user, entitlements };
}
