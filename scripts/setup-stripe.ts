/**
 * One-command Stripe setup for EDGEWISE's single paid plan (Pro).
 *
 *   npm run stripe:setup
 *
 * Reads STRIPE_SECRET_KEY from .env, then creates (or reuses) the "EDGEWISE Pro"
 * product and a recurring monthly price at the amount in PLANS.pro, and prints
 * the price id to paste into STRIPE_PRICE_PRO_MONTHLY. Idempotent: it looks up
 * an existing price by a stable lookup_key before creating a new one.
 *
 * Use a TEST secret key (sk_test_...) for development. Nothing is charged by
 * this script; it only creates catalog objects in your Stripe account.
 */
import "dotenv/config";
import Stripe from "stripe";
import { PLANS } from "../src/lib/subscriptions/plans";

const LOOKUP_KEY = "edgewise_pro_monthly";

function report(priceId: string, live: boolean) {
  console.log("\nNext steps:");
  console.log(`  1. Put this in .env:   STRIPE_PRICE_PRO_MONTHLY="${priceId}"`);
  console.log("  2. For webhooks in dev, run:");
  console.log("       stripe listen --forward-to localhost:3000/api/stripe/webhook");
  console.log('     then copy its "whsec_..." value into STRIPE_WEBHOOK_SECRET in .env.');
  console.log(`  3. Restart the app. Pricing checkout is now live${live ? " (LIVE mode — real charges)" : " in TEST mode"}.`);
  console.log("\nTest card: 4242 4242 4242 4242, any future expiry, any CVC.");
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set in .env. Create a free Stripe account, copy your TEST secret key (sk_test_...), put it in .env, and run this again.");
    process.exit(1);
  }
  const live = key.startsWith("sk_live_");
  if (live) console.warn("WARNING: using a LIVE Stripe key — real charges are possible.");
  const stripe = new Stripe(key);
  const amount = Math.round(PLANS.pro.priceMonthly * 100);

  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  if (existing.data[0]) {
    console.log(`Found existing Pro price: ${existing.data[0].id} ($${(existing.data[0].unit_amount ?? 0) / 100}/mo)`);
    report(existing.data[0].id, live);
    return;
  }

  const product = await stripe.products.create({ name: "EDGEWISE Pro", description: PLANS.pro.tagline, metadata: { app: "edgewise", tier: "pro" } });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: LOOKUP_KEY,
    metadata: { app: "edgewise", tier: "pro" },
  });
  console.log(`Created product ${product.id} and price ${price.id} ($${amount / 100}/mo).`);
  report(price.id, live);
}

main().catch((e) => {
  console.error("Stripe setup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
