import Link from "next/link";
import { Target, Trash2 } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getTrackerStats, resolveDueForUser, isLocked } from "@/lib/tracker";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CalibrationChart, LineChartSimple } from "@/components/charts/calibration-chart";
import { UpgradeGate } from "@/components/shared/badges";
import { ActionButton } from "@/components/shared/action-button";
import { LinkButton } from "@/components/ui/link-button";
import { pct, relative, dateShort, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";
import type { Prediction } from "@/generated/prisma/client";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const TABS = [
  { key: "all", label: "All forecasts" },
  { key: "market", label: "Prediction markets" },
  { key: "sports", label: "Sports" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function statusOf(p: Prediction): { label: string; tone: string } {
  if (p.outcome === true) return { label: "Side happened", tone: "text-status-good" };
  if (p.outcome === false) return { label: "Side did not happen", tone: "text-status-critical" };
  if (p.resolutionSource === "void") return { label: "Void (no result)", tone: "text-muted-foreground" };
  if (isLocked(p)) return { label: "Locked · awaiting result", tone: "text-status-warning" };
  return { label: p.lockedAt ? `Open · locks ${relative(p.lockedAt)}` : "Open", tone: "text-muted-foreground" };
}

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/tracker");
  const ent = await getEntitlements(session.user.id);
  await resolveDueForUser(session.user.id);
  const stats = await getTrackerStats(session.user.id);
  trackUsage("tracker.view", session.user.id);
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "all";
  const s = stats[tab];
  const preds = stats.predictions.filter((p) => tab === "all" || p.domain === tab);
  const depth = ent.limits.performanceTracker;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance Tracker"
        description="Your forecasts, scored honestly. Each prediction stores the market and model probabilities at the moment you made it, cannot be edited, and is resolved from the exchange or data provider, never by hand."
        actions={
          <LinkButton href="/markets" size="sm">
            <Target className="size-4" /> Find something to forecast
          </LinkButton>
        }
      />
      <nav className="flex gap-1 border-b border-border/60" aria-label="Forecast type">
        {TABS.map((t) => (
          <Link key={t.key} href={`/tracker?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label} <span className="tabular text-xs text-muted-foreground">{stats[t.key].total}</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Predictions made" value={s.total} hint={`${s.pending} open · ${s.voided} void`} />
        <StatCard label="Resolved" value={s.resolved} hint={s.resolved ? `${s.correct} on the right side of 50%` : "None resolved yet"} />
        <StatCard label="Directional accuracy" value={s.accuracy !== null ? pct(s.accuracy, 0) : "—"} hint="Share where your >50% side happened" />
        <StatCard label="Brier score" value={depth === "basic" ? "Pro" : s.brier !== null ? s.brier.toFixed(3) : "—"} hint="Lower is better · 0.25 = always 50%" />
        <StatCard label="Log loss" value={depth === "basic" ? "Pro" : s.logLoss !== null ? s.logLoss.toFixed(3) : "—"} hint="Punishes confident misses" />
      </div>

      {s.total === 0 ? (
        <EmptyState icon={<Target />} title="No forecasts yet" description="Open a market or a player projection and click Log prediction. It is a recorded forecast for scoring, not a wager." action={<LinkButton href="/markets" size="sm" variant="outline">Browse markets</LinkButton>} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <UpgradeGate locked={depth === "basic"} feature="Calibration curve" requiredTier="pro">
              <Section title="Calibration" description="When you say 70%, does it happen about 70% of the time? The diagonal is perfect calibration.">
                <CalibrationChart bins={s.calibration} />
              </Section>
            </UpgradeGate>
            <UpgradeGate locked={depth !== "advanced"} feature="Skill versus the market and score over time" requiredTier="pro">
              <Section title="Are you improving?" description="Cumulative Brier score by number of resolved forecasts">
                <LineChartSimple data={s.overTime} yLabel="Brier" yDomain={[0, 0.5]} />
                <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="rounded-lg bg-surface-2/50 p-2.5">
                    <dt className="text-muted-foreground">Market&apos;s Brier</dt>
                    <dd className="tabular text-sm font-semibold">{s.marketBrier !== null ? s.marketBrier.toFixed(3) : "—"}</dd>
                  </div>
                  <div className="rounded-lg bg-surface-2/50 p-2.5">
                    <dt className="text-muted-foreground">Model&apos;s Brier</dt>
                    <dd className="tabular text-sm font-semibold">{s.modelBrier !== null ? s.modelBrier.toFixed(3) : "—"}</dd>
                  </div>
                  <div className="rounded-lg bg-surface-2/50 p-2.5">
                    <dt className="text-muted-foreground">Skill vs market</dt>
                    <dd className={cn("tabular text-sm font-semibold", s.skillVsMarket !== null && (s.skillVsMarket > 0 ? "text-status-good" : "text-status-critical"))}>{s.skillVsMarket !== null ? `${(s.skillVsMarket * 100).toFixed(0)}%` : "—"}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Skill = 1 − your Brier ÷ the market&apos;s Brier on the same {s.skillSample} forecasts; shown after 5. Positive means you beat the market price recorded when you forecast. Small samples are mostly luck.
                </p>
              </Section>
            </UpgradeGate>
          </div>

          <UpgradeGate locked={depth !== "advanced"} feature="Performance by category" requiredTier="pro" compact>
            <Section title="By category">
              {s.byCategory.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 font-medium">Category</th>
                      <th className="tabular py-1.5 text-right font-medium">Resolved</th>
                      <th className="tabular py-1.5 text-right font-medium">Accuracy</th>
                      <th className="tabular py-1.5 text-right font-medium">Brier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byCategory.map((c) => (
                      <tr key={c.category} className="border-t border-border/50">
                        <td className="py-1.5 capitalize">{c.category}</td>
                        <td className="tabular py-1.5 text-right">{c.n}</td>
                        <td className="tabular py-1.5 text-right">{c.accuracy !== null ? pct(c.accuracy, 0) : "—"}</td>
                        <td className="tabular py-1.5 text-right">{c.brier !== null ? c.brier.toFixed(3) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Category results appear once forecasts resolve.</p>
              )}
            </Section>
          </UpgradeGate>

          <Section title="Forecast log" description="Immutable once created. A forecast can be withdrawn only before it locks.">
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 font-medium">Forecast</th>
                    <th className="py-1.5 font-medium">Side</th>
                    <th className="tabular py-1.5 text-right font-medium">You</th>
                    <th className="tabular hidden py-1.5 text-right font-medium sm:table-cell">Market then</th>
                    <th className="tabular hidden py-1.5 text-right font-medium sm:table-cell">Model then</th>
                    <th className="py-1.5 pl-4 font-medium">Status</th>
                    <th className="hidden py-1.5 font-medium md:table-cell">Logged</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {preds.map((p) => {
                    const st = statusOf(p);
                    const href = p.domain === "market" ? `/markets/${p.refId}` : `/sports/players/${p.refId.split(":")[0]}`;
                    return (
                      <tr key={p.id} className="border-t border-border/50 align-top">
                        <td className="py-2 pr-3">
                          <Link href={href} className="font-medium hover:text-primary">
                            {p.question}
                          </Link>
                          <div className="text-[11px] capitalize text-muted-foreground">
                            {titleCase(p.domain)} · {p.category ?? "Uncategorized"}
                            {p.notes ? ` · “${p.notes}”` : ""}
                          </div>
                        </td>
                        <td className="py-2 uppercase">{p.side}</td>
                        <td className="tabular py-2 text-right font-semibold">{pct(p.predictedProb, 0)}</td>
                        <td className="tabular hidden py-2 text-right text-muted-foreground sm:table-cell">{p.marketProb !== null ? pct(p.marketProb, 0) : "n/a"}</td>
                        <td className="tabular hidden py-2 text-right text-muted-foreground sm:table-cell">{p.modelProb !== null ? pct(p.modelProb, 0) : "n/a"}</td>
                        <td className={cn("py-2 pl-4 text-xs", st.tone)}>
                          {st.label}
                          
                          {p.outcome !== null && <div className="tabular text-[11px] text-muted-foreground">Brier {((p.predictedProb - (p.outcome ? 1 : 0)) ** 2).toFixed(3)} · via {p.resolutionSource}</div>}
                        </td>
                        <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">{dateShort(p.createdAt)}</td>
                        <td className="py-2 text-right">
                          {!isLocked(p) && (
                            <ActionButton href={`/api/predictions?id=${p.id}`} method="DELETE" variant="ghost" size="xs" confirm="Withdraw this forecast? It will not be scored.">
                              <Trash2 className="size-3.5" />
                              <span className="sr-only">Withdraw</span>
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">Historical performance does not guarantee future results. A handful of resolved forecasts cannot distinguish skill from luck; look for calibration across dozens.</p>
    </div>
  );
}
