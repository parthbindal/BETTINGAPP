import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getAdminMetrics, getSignupsByDay } from "@/lib/admin";
import { Section } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LineChartSimple } from "@/components/charts/calibration-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { pct, usd, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start justify-between gap-3 text-sm">
      <span>
        <span className={cn("mr-2 inline-block size-2 rounded-full", ok ? "bg-status-good" : "bg-status-warning")} aria-hidden />
        {label}
      </span>
      <span className="text-right text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [m, signups] = await Promise.all([getAdminMetrics(), getSignupsByDay(30)]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered users" value={m.users.toLocaleString()} hint={`${m.users30} new in 30 days · ${m.activeUsers7} active in 7`} />
        <StatCard label="Active subscriptions" value={m.paidUsers} hint="Paid and complimentary Pro" />
        <StatCard label="MRR" value={usd(m.mrr)} hint={`Stripe-billed only${m.compMrrEquivalent ? ` · ${usd(m.compMrrEquivalent)} complimentary value` : ""}`} />
        <StatCard label="ARR" value={usd(m.arr, 0)} hint="MRR × 12" />
        <StatCard label="Free → paid conversion" value={pct(m.conversion, 1)} hint="Active Pro ÷ registered users" />
        <StatCard label="Churn (30 days)" value={pct(m.churn, 1)} hint={`${m.canceled30} canceled`} />
        <StatCard label="AI spend (30 days)" value={usd(m.ai.costUsd30, 4)} hint={`${m.ai.calls30} calls · ${m.ai.configured ? m.ai.model : "rule-based mode"}`} />
        <StatCard label="Errors (24 hours)" value={m.errors24h} hint="See System for details" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Sign-ups" description="Last 30 days" className="lg:col-span-2">
          <LineChartSimple data={signups} yLabel="Sign-ups" digits={0} />
        </Section>
        <Section title="Subscription breakdown">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Plan</th>
                <th className="py-1.5 font-medium">Source</th>
                <th className="tabular py-1.5 text-right font-medium">Users</th>
              </tr>
            </thead>
            <tbody>
              {m.subsBreakdown.map((s) => (
                <tr key={`${s.tier}-${s.source}`} className="border-t border-border/50">
                  <td className="py-1.5 capitalize">{s.tier}</td>
                  <td className="py-1.5 capitalize text-muted-foreground">{s.source === "none" ? "—" : s.source}</td>
                  <td className="tabular py-1.5 text-right">{s.count}</td>
                </tr>
              ))}
              {!m.subsBreakdown.length && (
                <tr>
                  <td colSpan={3} className="py-3 text-xs text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="AI usage and unit economics" description="Measured from recorded API usage">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Calls (all time)</dt><dd className="tabular">{m.ai.calls.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Input tokens</dt><dd className="tabular">{compact(m.ai.inputTokens)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Output tokens</dt><dd className="tabular">{compact(m.ai.outputTokens)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Cache-read tokens</dt><dd className="tabular">{compact(m.ai.cacheReadTokens)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Cost (all time)</dt><dd className="tabular">{usd(m.ai.costUsd, 4)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Margin after AI cost (30d)</dt><dd className="tabular">{m.grossMargin !== null ? pct(m.grossMargin, 1) : "n/a (no revenue)"}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">Hosting, database and data-provider fees are billed by those vendors and are not tracked here, so this margin covers AI inference only.</p>
        </Section>
        <Section title="Feature usage" description="Events in the last 7 days">
          {m.featureUsage7.length ? <RankedBars data={m.featureUsage7.slice(0, 10).map((f) => ({ name: f.feature, value: f.count }))} valueLabel="Events" /> : <p className="text-xs text-muted-foreground">No activity recorded yet.</p>}
        </Section>
        <Section title="Integrations" right={<Link href="/admin/system" className="text-xs text-primary hover:underline">System →</Link>}>
          <ul className="space-y-2">
            <Status ok label="Database" detail={m.integrations.database === "postgresql" ? "PostgreSQL" : "SQLite (development)"} />
            <Status ok label="Kalshi market data" detail="Public API, no key required" />
            <Status ok={m.integrations.ai} label="AI provider" detail={m.integrations.ai ? m.ai.model : "Not configured: rule-based analyst"} />
            <Status ok={m.integrations.stripe} label="Stripe billing" detail={m.integrations.stripe ? (m.integrations.stripeWebhook ? "Configured with webhook" : "Keys set; webhook secret missing") : "Not configured: checkout disabled"} />
            <Status ok={m.integrations.sportsLive} label="Sports data" detail={m.integrations.sportsLive ? "Provider key set" : "Not configured"} />
            <Status ok={m.integrations.email} label="Email delivery" detail={m.integrations.email ? "Resend configured" : "Not configured: emails are logged, not sent"} />
          </ul>
        </Section>
      </div>
    </div>
  );
}
