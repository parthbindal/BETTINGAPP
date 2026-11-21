import { guarded, json, apiError } from "@/lib/api";
import { config } from "@/lib/env";
import { db } from "@/lib/db";
import { createPortalSession } from "@/lib/stripe";

/** Opens Stripe's customer portal: upgrade, downgrade, cancel, payment methods, invoices. */
export const POST = guarded({ scope: "stripe.portal", limit: 10 }, async (ctx) => {
  if (!config.isStripeConfigured) return apiError("Billing is not configured on this deployment.", 503);
  const sub = await db.subscription.findUnique({ where: { userId: ctx.user.id } });
  if (!sub?.stripeCustomerId) return apiError("You do not have a billing account yet. Choose a plan first.", 409);
  const url = await createPortalSession(ctx.user.id);
  return json({ url });
});
