import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { PLANS, TIER_ORDER, type Tier } from "@/lib/subscriptions/plans";
import { listInvoices } from "@/lib/stripe";
import { countQueriesToday } from "@/lib/ai/analyst";
import { countReportsThisMonth } from "@/lib/ai/reports";
import { getReferralSummary, REFERRAL_TERMS } from "@/lib/referrals";
import { Section } from "@/components/shared/page-header";
import { TierBadge } from "@/components/shared/badges";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { ActionButton } from "@/components/shared/action-button";
import { CopyField } from "@/components/settings/copy-field";
import { dateShort, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3">
        <div className={cn("h-1.5 rounded-full", ratio >= 1 ? "bg-status-serious" : "bg-chart-1")} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/settings/subscription");
  const userId = session.user.id;
  const ent = await getEntitlements(userId);
  const [aiToday, reportsMonth, watchCount, referral, invoices] = await Promise.all([
    countQueriesToday(userId),
    countReportsThisMonth(userId),
    db.watchlistItem.count({ where: { userId } }),
    getReferralSummary(userId),
    listInvoices(userId).catch(async (e) => {
      await logError("settings.invoices", e);
      return [];
    }),
  ]);
  const plan = PLANS[ent.tier];
  const isStripe = ent.source === "stripe";
  const isComp = ent.source === "complimentary" && ent.tier !== "free";
  const statusLabel =
    ent.tier === "free"
      ? "Free plan"
      : isComp
        ? `Complimentary${ent.currentPeriodEnd ? ` until ${dateShort(ent.currentPeriodEnd)}` : ""}`
        : ent.status === "past_due"
          ? "Past due: payment needed"
          : ent.status === "trialing"
            ? "Trialing"
            : ent.cancelAtPeriodEnd
              ? `Cancels on ${dateShort(ent.currentPeriodEnd)}`
              : `Active${ent.currentPeriodEnd ? ` · renews ${dateShort(ent.currentPeriodEnd)}` : ""}`;
  const warn = ent.status === "past_due" || ent.cancelAtPeriodEnd;

  return (
    <div className="space-y-4">
      {sp.checkout === "success" && (
        <div className="flex items-start gap-2 rounded-lg border border-status-good/40 bg-status-good/10 px-3 py-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-good" />
          <span>Thank you. Stripe is confirming your subscription; your plan updates here within a few seconds of confirmation. Refresh if it still shows the old plan.</span>
        </div>
      )}
      {!config.isStripeConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Billing is not configured on this deployment. Checkout is disabled and nobody can be charged until Stripe keys and price IDs are set.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Current plan" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold tracking-tight">{plan.name}</span>
            <TierBadge tier={ent.tier} />
            <span className={cn("rounded-full border px-2 py-0.5 text-xs", warn ? "border-status-warning/40 text-status-warning" : "border-border text-muted-foreground")}>{statusLabel}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.priceMonthly === 0 ? "No charge." : isComp ? `Normally $${plan.priceMonthly}/month; no payment is being collected.` : `$${plan.priceMonthly} per month, billed by Stripe.`} {plan.tagline}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isStripe ? (
              <>
                <ActionButton href="/api/stripe/portal" variant="default" refresh={false}>
                  Change plan
                </ActionButton>
                <ActionButton href="/api/stripe/portal" refresh={false}>
                  Update payment method
                </ActionButton>
                <ActionButton href="/api/stripe/portal" refresh={false}>
                  {ent.cancelAtPeriodEnd ? "Resume subscription" : "Cancel subscription"}
                </ActionButton>
              </>
            ) : (
              <Link href="/pricing" className="text-sm text-primary hover:underline">
                Compare all plans →
              </Link>
            )}
          </div>
          {isStripe && <p className="mt-2 text-[11px] text-muted-foreground">Upgrades, downgrades, cancellation and payment methods are handled in Stripe&apos;s secure billing portal. If you cancel, access continues until the end of the paid period.</p>}

          {!isStripe && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(["pro"] as Tier[])
                .filter((t) => TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(ent.tier) || isComp)
                .map((t) => (
                  <div key={t} className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold">{PLANS[t].name}</span>
                      <span className="tabular text-sm">
                        ${PLANS[t].priceMonthly}
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{PLANS[t].tagline}</p>
                    <div className="mt-3">
                      <CheckoutButton tier={t} configured={config.isStripeConfigured} signedIn currentTier={isComp ? undefined : ent.tier} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Section>

        <Section title="Usage and limits" description="Limits reset daily (AI) and monthly (reports)">
          <div className="space-y-3">
            <Meter label="AI Analyst queries today" used={aiToday} limit={ent.limits.aiQueriesPerDay} />
            <Meter label="Research reports this month" used={reportsMonth} limit={ent.limits.reportsPerMonth} />
            <Meter label="Watchlist items" used={watchCount} limit={ent.limits.watchlistMax} />
          </div>
          <dl className="mt-4 space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Market history</dt><dd>{ent.limits.marketHistoryDays >= 365 ? `${Math.round(ent.limits.marketHistoryDays / 365)} years` : `${ent.limits.marketHistoryDays} days`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Opportunity scanner</dt><dd>{ent.limits.scanner ? (ent.limits.scannerAdvancedFilters ? "Enhanced filters" : "Included") : "Not included"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Academy</dt><dd className="capitalize">{ent.limits.academyLevels.join(", ")}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Performance tracker</dt><dd className="capitalize">{ent.limits.performanceTracker}</dd></div>
          </dl>
        </Section>
      </div>

      <Section title="Billing history" description="Invoices issued by Stripe">
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 font-medium">Invoice</th>
                  <th className="py-1.5 font-medium">Amount</th>
                  <th className="py-1.5 font-medium">Status</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border/50">
                    <td className="tabular py-2">{dateShort(inv.created)}</td>
                    <td className="py-2 font-mono text-xs">{inv.number ?? inv.id}</td>
                    <td className="tabular py-2">{usd(inv.amountPaid)}</td>
                    <td className="py-2 capitalize text-muted-foreground">{inv.status}</td>
                    <td className="py-2 text-right">
                      {inv.hostedUrl && (
                        <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{config.isStripeConfigured ? "No invoices yet." : "No invoices: billing is not configured on this deployment."}</p>
        )}
      </Section>

      <Section title="Refer a friend" description="A transparent reward, paid once per subscribing referral">
        {referral.link ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <CopyField value={referral.link} label="Your referral link" />
              <p className="text-xs text-muted-foreground">
                Code: <span className="font-mono">{referral.code}</span>
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{REFERRAL_TERMS}</p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Signed up", referral.signedUp],
                ["Subscribed", referral.converted],
                ["Rewards applied", referral.rewarded],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg bg-surface-2/50 p-3">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="tabular text-xl font-semibold">{n}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your referral code is being prepared.</p>
        )}
      </Section>
    </div>
  );
}
