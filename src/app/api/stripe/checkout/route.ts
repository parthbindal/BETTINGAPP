import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { config } from "@/lib/env";
import { db } from "@/lib/db";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe";
import { trackUsage } from "@/lib/ops";

const Body = z.object({ tier: z.literal("pro") });

export const POST = guarded({ schema: Body, scope: "stripe.checkout", limit: 10 }, async (ctx, body) => {
  // No charge can be started unless Stripe is fully configured.
  if (!config.isStripeConfigured) return apiError("Billing is not configured on this deployment. No charge was made.", 503);
  const sub = await db.subscription.findUnique({ where: { userId: ctx.user.id } });
  const hasActiveStripe = sub?.source === "stripe" && sub.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(sub.status);
  // Existing subscribers change plans in the billing portal, never through a second checkout.
  const url = hasActiveStripe ? await createPortalSession(ctx.user.id) : await createCheckoutSession({ id: ctx.user.id, email: ctx.user.email, name: ctx.user.name }, body.tier);
  if (!url) return apiError("Could not start checkout.", 502);
  trackUsage("billing.checkout_started", ctx.user.id, { tier: body.tier });
  return json({ url });
});
