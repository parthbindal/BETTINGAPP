import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { Section } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { relative, dateTime, usd, compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { daysAgo } from "@/lib/time";

const JOBS = [
  { id: "sync-markets", label: "Full market scan", hint: "Walk Kalshi's whole open feed (about a minute), cache active markets, close ones that left, record snapshots. Suggested: every 30 minutes." },
  { id: "refresh-hot", label: "Refresh hot markets", hint: "Re-quote the most liquid and all watched markets in a few batched requests. Suggested: every 5 minutes." },
  { id: "whale-watch", label: "Whale Watch sync", hint: "Pull the top 1000 Polymarket traders and aggregate their current positions (~60-90s). Suggested: every 30 minutes." },
  { id: "watchlist-alerts", label: "Watchlist alerts", hint: "Create notifications for watched-market moves and upcoming events. Suggested: every 15 minutes." },
  { id: "resolve-predictions", label: "Resolve predictions", hint: "Score forecasts from exchange and NBA results. Suggested: hourly." },
  { id: "daily-brief", label: "Daily brief", hint: "Generate the daily research summary and send opted-in digests. Suggested: daily." },
  { id: "weekly-brief", label: "Weekly brief", hint: "Generate the weekly summary and send opted-in digests. Suggested: weekly." },
  { id: "onboarding-emails", label: "Onboarding emails", hint: "Advance the six-step onboarding sequence. Suggested: hourly." },
];

const statusTone: Record<string, string> = { ok: "text-status-good", degraded: "text-status-warning", down: "text-status-critical", unconfigured: "text-muted-foreground", unknown: "text-muted-foreground" };

export default async function AdminSystemPage() {
  await requireAdmin();
  const since = daysAgo(30);
  const [providers, errors, aiByModel, emailByStatus, marketCount, snapshotCount, lastMarket] = await Promise.all([
    db.providerHealth.findMany({ orderBy: { provider: "asc" } }),
    db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.aiUsage.groupBy({ by: ["model", "kind"], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, costUsd: true } }),
    db.emailLog.groupBy({ by: ["status"], _count: { _all: true } }),
    db.market.count(),
    db.marketSnapshot.count(),
    db.market.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
  ]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Data provider health" description="Recorded on every provider call">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Provider</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">Last success</th>
                <th className="tabular py-1.5 text-right font-medium">Latency</th>
                <th className="tabular py-1.5 text-right font-medium">Calls today</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider} className="border-t border-border/50 align-top">
                  <td className="py-1.5 capitalize">{p.provider}</td>
                  <td className={cn("py-1.5 capitalize", statusTone[p.status] ?? "")}>
                    {p.status}
                    {p.lastError && <div className="max-w-[16rem] truncate text-[11px] text-muted-foreground" title={p.lastError}>{p.lastError}</div>}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">{relative(p.lastSuccessAt)}</td>
                  <td className="tabular py-1.5 text-right">{p.latencyMs !== null ? `${p.latencyMs} ms` : "—"}</td>
                  <td className="tabular py-1.5 text-right">{p.callsToday}</td>
                </tr>
              ))}
              {!providers.length && (
                <tr>
                  <td colSpan={5} className="py-3 text-xs text-muted-foreground">
                    No provider calls recorded yet. Run “Full market scan”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-lg bg-surface-2/50 p-2.5"><dt className="text-muted-foreground">Markets cached</dt><dd className="tabular text-sm font-semibold">{compact(marketCount)}</dd></div>
            <div className="rounded-lg bg-surface-2/50 p-2.5"><dt className="text-muted-foreground">Price snapshots</dt><dd className="tabular text-sm font-semibold">{compact(snapshotCount)}</dd></div>
            <div className="rounded-lg bg-surface-2/50 p-2.5"><dt className="text-muted-foreground">Last sync</dt><dd className="text-sm font-semibold">{relative(lastMarket?.fetchedAt)}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">Sports data: {config.isSportsLiveConfigured ? "provider key set" : "no NBA provider key set"}.</p>
        </Section>

        <Section title="Jobs" description={config.cronSecret ? "Schedulers call /api/jobs/<name> with the CRON_SECRET bearer token" : "Set CRON_SECRET to let a scheduler call these endpoints"}>
          <ul className="space-y-3">
            {JOBS.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{j.label}</div>
                  <div className="text-xs text-muted-foreground">{j.hint}</div>
                </div>
                <ActionButton href={`/api/jobs/${j.id}`}>Run now</ActionButton>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="AI usage by model" description="Last 30 days">
          {aiByModel.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">Model</th>
                  <th className="py-1.5 font-medium">Use</th>
                  <th className="tabular py-1.5 text-right font-medium">Calls</th>
                  <th className="tabular py-1.5 text-right font-medium">Tokens in / out</th>
                  <th className="tabular py-1.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {aiByModel.map((a) => (
                  <tr key={`${a.model}-${a.kind}`} className="border-t border-border/50">
                    <td className="py-1.5 font-mono text-xs">{a.model}</td>
                    <td className="py-1.5 capitalize text-muted-foreground">{a.kind}</td>
                    <td className="tabular py-1.5 text-right">{a._count._all}</td>
                    <td className="tabular py-1.5 text-right">{compact(a._sum.inputTokens ?? 0)} / {compact(a._sum.outputTokens ?? 0)}</td>
                    <td className="tabular py-1.5 text-right">{usd(a._sum.costUsd ?? 0, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">No analyst or report calls in the last 30 days.</p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Model “rules” is the rule-based analyst used when no AI key is configured; it costs nothing.</p>
        </Section>
        <Section title="Email log" description={config.isEmailConfigured ? "Delivered through Resend" : "No email provider configured: messages are recorded as skipped"}>
          {emailByStatus.length ? (
            <ul className="space-y-1.5 text-sm">
              {emailByStatus.map((e) => (
                <li key={e.status} className="flex justify-between">
                  <span className="capitalize text-muted-foreground">{e.status.replace(/_/g, " ")}</span>
                  <span className="tabular">{e._count._all}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No emails attempted yet.</p>
          )}
        </Section>
      </div>

      <Section title="Recent errors" description="Most recent 40">
        {errors.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">When</th>
                  <th className="py-1.5 font-medium">Scope</th>
                  <th className="py-1.5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id} className="border-t border-border/50 align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground" title={dateTime(e.createdAt)}>{relative(e.createdAt)}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-mono">{e.scope}</td>
                    <td className="py-1.5">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No errors recorded.</p>
        )}
      </Section>
    </div>
  );
}
