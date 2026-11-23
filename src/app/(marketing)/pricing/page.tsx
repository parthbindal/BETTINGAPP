import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check } from "lucide-react";
import { PLANS, featureMatrix, planHighlights, type Tier } from "@/lib/subscriptions/plans";
import { config } from "@/lib/env";
import { getSession, getEntitlements } from "@/lib/session";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing", description: "Free and Pro plans for EDGEWISE." };

/** Telegram appears in the plan copy only on a deployment where it is switched on. */
const delivery = { telegram: config.isTelegramConfigured, channel: config.isTelegramChannelConfigured };

/** Session- and config-dependent call to action; streams in behind a boundary. */
async function PlanCta({ tier }: { tier: Tier }) {
  const session = await getSession();
  const ent = session ? await getEntitlements(session.user.id) : null;
  return <CheckoutButton tier={tier} configured={config.isStripeConfigured} signedIn={Boolean(session)} currentTier={ent?.tier} hasStripeSubscription={ent?.source === "stripe"} />;
}

/** Read at request time so a runtime env change is reflected without a rebuild. */
async function BillingNotice() {
  await connection();
  if (config.isStripeConfigured) return null;
  return (
    <p className="mx-auto mt-3 max-w-xl rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
      Billing is not configured on this deployment. Checkout is disabled and no one can be charged until Stripe keys and price IDs are set.
    </p>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing. Honest limits.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">The Free plan is genuinely useful. Paid plans add depth, history and volume, never basic transparency. Cancel any time.</p>
        <Suspense fallback={null}>
          <BillingNotice />
        </Suspense>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
        {(Object.keys(PLANS) as Tier[]).map((tier) => {
          const p = PLANS[tier];
          const popular = tier === "pro";
          return (
            <div key={tier} className={cn("card-surface relative flex flex-col p-6", popular && "glow-primary border-primary/40")}>
              {popular && <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Most popular</span>}
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{p.name}</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="tabular text-4xl font-semibold tracking-tight">{p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {planHighlights(p.tier, delivery).map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" /> <span>{h}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Suspense
                  fallback={
                    <LinkButton href="/sign-up" className="w-full" variant={popular ? "default" : "outline"}>
                      {tier === "free" ? "Start free" : `Get ${p.name}`}
                    </LinkButton>
                  }
                >
                  <PlanCta tier={tier} />
                </Suspense>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-14">
        <h2 className="text-lg font-semibold tracking-tight">Feature comparison</h2>
        <div className="card-surface mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Feature</th>
                <th className="px-4 py-3 font-medium">Free</th>
                <th className="px-4 py-3 font-medium text-primary">Pro</th>
              </tr>
            </thead>
            <tbody>
              {featureMatrix(delivery).map((row) => (
                <tr key={row.label} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">{row.label}</td>
                  <td className="tabular px-4 py-2.5 text-muted-foreground">{row.free}</td>
                  <td className="tabular px-4 py-2.5">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Prices in USD. Subscriptions renew monthly and can be canceled from Settings → Subscription; access continues until the end of the paid period. Taxes may apply. EDGEWISE does not execute wagers or hold funds.</p>
      </div>
    </div>
  );
}
