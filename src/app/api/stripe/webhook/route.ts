import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/stripe";
import { config } from "@/lib/env";
import { db } from "@/lib/db";
import { logError } from "@/lib/ops";

/**
 * Stripe webhook. The signature is verified against the raw body, and each
 * event id is processed once (Stripe retries deliveries).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !config.isStripeWebhookConfigured) return new Response("Stripe webhook is not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, config.stripeWebhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Claim the event id first; a duplicate delivery fails the unique constraint.
  try {
    await db.billingEvent.create({ data: { stripeEventId: event.id, type: event.type } });
  } catch {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.metadata?.userId && session.metadata?.userId) sub.metadata = { ...sub.metadata, userId: session.metadata.userId };
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const sub = customerId ? await db.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
        if (sub) {
          await db.notification.create({
            data: { userId: sub.userId, type: "system", title: "Payment failed", body: "Your last subscription payment did not go through. Update your payment method to keep your plan.", href: "/settings/subscription" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Release the claim so Stripe's retry is processed.
    await db.billingEvent.delete({ where: { stripeEventId: event.id } }).catch(() => {});
    await logError("stripe.webhook", e, { type: event.type, id: event.id });
    return new Response("Webhook handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
