import Stripe from "stripe";
import { config } from "@/lib/env";
import { db } from "@/lib/db";
import { PLANS, type Tier } from "@/lib/subscriptions/plans";
import { logError } from "@/lib/ops";

let stripeSingleton: Stripe | null = null;

/** Returns a Stripe client only when configured; callers must handle null. */
export function getStripe(): Stripe | null {
  if (!config.isStripeConfigured) return null;
  if (!stripeSingleton) stripeSingleton = new Stripe(config.stripeSecretKey, { typescript: true });
  return stripeSingleton;
}

export function priceIdForTier(tier: Tier): string | null {
  if (tier === "pro") return config.stripePriceProMonthly || null;
  return null;
}

export function tierForPriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return "free";
  if (priceId === config.stripePriceProMonthly) return "pro";
  return "free";
}

export async function getOrCreateCustomer(userId: string, email: string, name: string): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (sub?.stripeCustomerId) {
    // The saved customer may live in another Stripe account (test -> live switch, or a different
    // key on the deployment). Reuse it only if this account still has it; otherwise start fresh.
    try {
      const existing = await stripe.customers.retrieve(sub.stripeCustomerId);
      if (!("deleted" in existing && existing.deleted)) return sub.stripeCustomerId;
    } catch (e) {
      if ((e as { code?: string })?.code !== "resource_missing") throw e;
    }
  }
  const customer = await stripe.customers.create({ email, name, metadata: { userId } });
  await db.subscription.upsert({
    where: { userId },
    create: { userId, tier: "free", status: "active", source: "none", stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createCheckoutSession(user: { id: string; email: string; name: string }, tier: Tier) {
  const stripe = getStripe();
  const price = priceIdForTier(tier);
  if (!stripe || !price) throw new Error("Stripe is not configured");
  const customer = await getOrCreateCustomer(user.id, user.email, user.name);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    success_url: `${config.appUrl}/settings/subscription?checkout=success`,
    cancel_url: `${config.appUrl}/pricing?checkout=canceled`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id, tier } },
    metadata: { userId: user.id, tier },
  });
  return session.url;
}

export async function createPortalSession(userId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) throw new Error("No billing account yet");
  const session = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${config.appUrl}/settings/subscription` });
  return session.url;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  // Newer API versions carry the period on the subscription item.
  const item = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const ts = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

/** Mirror a Stripe subscription into our table. Idempotent. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = sub.metadata?.userId ?? (await db.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { userId: true } }))?.userId;
  if (!userId) {
    await logError("stripe.sync", new Error("No user for subscription"), { subscriptionId: sub.id, customerId });
    return;
  }
  const priceId = sub.items.data[0]?.price.id ?? null;
  const ended = sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired";
  const data = {
    tier: ended ? "free" : tierForPriceId(priceId),
    status: ended ? "canceled" : sub.status,
    source: ended ? "none" : "stripe",
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    grantedById: null,
    grantNote: null,
  };
  await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  if (!ended && (sub.status === "active" || sub.status === "trialing") && data.tier !== "free") {
    await grantReferralReward(userId).catch((e) => logError("stripe.referral", e, { userId }));
  }
}

/**
 * One month of Pro for the referrer, once, when a referred user becomes a
 * paying subscriber. Paying referrers get invoice credit; free referrers get
 * a complimentary month. See REFERRAL_TERMS for the user-facing wording.
 */
export async function grantReferralReward(referredUserId: string) {
  const ref = await db.referral.findUnique({ where: { referredUserId } });
  if (!ref || ref.status === "rewarded" || ref.referrerId === referredUserId) return;
  const sub = await db.subscription.findUnique({ where: { userId: ref.referrerId } });
  const stripe = getStripe();
  if (sub?.source === "stripe" && sub.stripeCustomerId && stripe) {
    await stripe.customers.createBalanceTransaction(sub.stripeCustomerId, {
      amount: -Math.round(PLANS.pro.priceMonthly * 100),
      currency: "usd",
      description: "EDGEWISE referral reward: one month of Pro",
    });
  } else {
    const base = sub?.source === "complimentary" && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now() ? sub.currentPeriodEnd : new Date();
    const end = new Date(base.getTime() + 30 * 86400_000);
    const tier: Tier = "pro";
    await db.subscription.upsert({
      where: { userId: ref.referrerId },
      create: { userId: ref.referrerId, tier, status: "active", source: "complimentary", currentPeriodEnd: end, grantNote: "Referral reward" },
      update: { tier, status: "active", source: "complimentary", currentPeriodEnd: end, grantNote: "Referral reward" },
    });
  }
  await db.referral.update({ where: { id: ref.id }, data: { status: "rewarded", rewardedAt: new Date() } });
  await db.notification.create({
    data: { userId: ref.referrerId, type: "system", title: "Referral reward applied", body: "Someone you referred subscribed. One month of Pro has been credited to your account.", href: "/settings/subscription" },
  });
}

/** Cancel a user's Stripe subscription immediately (used before account deletion). */
export async function cancelStripeSubscriptionForUser(userId: string) {
  const stripe = getStripe();
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!stripe || !sub?.stripeSubscriptionId || sub.source !== "stripe") return;
  try {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
  } catch (e) {
    await logError("stripe.cancelOnDelete", e, { userId });
  }
}

export async function listInvoices(userId: string) {
  const stripe = getStripe();
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!stripe || !sub?.stripeCustomerId) return [];
  const res = await stripe.invoices.list({ customer: sub.stripeCustomerId, limit: 12 });
  return res.data.map((inv) => ({
    id: inv.id ?? "",
    number: inv.number,
    amountPaid: inv.amount_paid / 100,
    currency: inv.currency,
    status: inv.status,
    created: new Date(inv.created * 1000),
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdf: inv.invoice_pdf ?? null,
  }));
}
