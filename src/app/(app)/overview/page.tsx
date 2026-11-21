import Link from "next/link";
import { ArrowRight, ArrowUpRight, Coins, GitMerge, Layers, Users } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { getWhaleWatch, getWhaleHistory, type WhaleHistoryPoint } from "@/lib/whales";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { listWatchlist } from "@/lib/watchlist";
import { getAcademyProgress } from "@/lib/academy";
import { COURSES } from "@/content/academy";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { MetricCard } from "@/components/intel/metric-card";
import { ActivityChart } from "@/components/intel/activity-chart";
import { TraderIdentity } from "@/components/intel/trader-identity";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { LinkButton } from "@/components/ui/link-button";
import { compact, pct, relative } from "@/lib/format";
import { ageMs, dailyActivity, polymarketEventUrl, scanChange, windowStart } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "3d", days: 3, label: "3D" },
  { key: "7d", days: 7, label: "7D" },
  { key: "10d", days: 10, label: "10D" },
] as const;
const DAY_MS = 86_400_000;

function RangeSelector({ active }: { active: string }) {
  return (
    <nav className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Date range">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`/overview?range=${r.key}`}
          scroll={false}
          aria-current={r.key === active ? "page" : undefined}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", r.key === active && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]")}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

const series = (history: WhaleHistoryPoint[], key: keyof Omit<WhaleHistoryPoint, "generatedAt">) => (history.length >= 2 ? history.map((h) => h[key]) : undefined);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireUser("/overview");
  const userId = session.user.id;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const [ent, whale, history, watchlist, progress, recentConvos] = await Promise.all([
    getEntitlements(userId),
    getWhaleWatch(),
    getWhaleHistory(CONSENSUS_MIN_WALLETS),
    listWatchlist(userId),
    getAcademyProgress(userId),
    db.aiConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 4 }),
  ]);
  trackUsage("overview.view", userId);
  const pro = ent.limits.scanner;

  const header = (
    <PageHeader
      eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      title="Market Intelligence"
      description="See where the most successful traders are positioning themselves."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <RangeSelector active={range.key} />
          {pro && <WhaleRefreshButton />}
        </div>
      }
    />
  );

  if (!whale) {
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState title="No Polymarket scan yet" description="The dashboard fills in after EDGEWISE completes its first scan of Polymarket's top 1,000 wallets." action={pro ? <WhaleRefreshButton /> : undefined} />
        </Section>
      </div>
    );
  }

  const p = whale.payload;
  const wallets = p.wallets ?? [];
  const active = wallets.filter((w) => w.positions > 0).length;
  const combinedPnl = wallets.reduce((s, w) => s + w.pnl, 0);
  const consensus = p.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS);
  const since = windowStart(range.days);
  const moves = p.recentMoves.filter((m) => Date.parse(m.tsIso) >= since);
  const flow = dailyActivity(p, range.days);
  const tradesInRange = flow.reduce((s, d) => s + d.trades, 0);
  const coverageCut = flow.some((d) => d.partial) && p.coverageFrom ? p.coverageFrom : null;
  const topTraders = [...wallets].sort((a, b) => a.rank - b.rank).slice(0, 10);

  return (
    <div className="space-y-6">
      {header}
      <ScanFreshness generatedAt={p.generatedAt} note={`${p.tradersScanned.toLocaleString("en-US")} wallets from Polymarket's profit leaderboard`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active tracked wallets"
          value={active.toLocaleString("en-US")}
          hint={`of the ${p.tradersScanned.toLocaleString("en-US")} most profitable wallets hold open positions`}
          change={scanChange(history, "activeWallets")}
          spark={series(history, "activeWallets")}
          icon={<Users />}
        />
        <MetricCard
          label="Combined wallet profit"
          value={`$${compact(combinedPnl)}`}
          hint="Leaderboard profit across all tracked wallets"
          change={scanChange(history, "combinedPnl")}
          spark={series(history, "combinedPnl")}
          icon={<Coins />}
        />
        <MetricCard
          label="Positions analyzed"
          value={p.positionsScanned.toLocaleString("en-US")}
          hint={`Open positions mapped, plus ${tradesInRange.toLocaleString("en-US")} trades of $300+ in ${range.label}`}
          change={scanChange(history, "positionsScanned")}
          spark={series(history, "positionsScanned")}
          icon={<Layers />}
        />
        <MetricCard
          label="Active consensus signals"
          value={consensus.length.toLocaleString("en-US")}
          hint={`Outcomes held by ${CONSENSUS_MIN_WALLETS}+ tracked wallets, hedges excluded`}
          change={scanChange(history, "consensusOutcomes")}
          spark={series(history, "consensusOutcomes")}
          icon={<GitMerge />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Tracked trader activity"
          description={`Dollar volume of trades of $300+ by the top ${p.recentTraders ?? 60} traders, per day (UTC)`}
          className="lg:col-span-2"
        >
          <ActivityChart data={flow} />
          {coverageCut && <p className="mt-2 text-[11px] text-muted-foreground">Faded days, before {new Date(coverageCut).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC, may undercount the busiest traders: Polymarket returns at most 500 trades per trader per request.</p>}
        </Section>

        <Section title="Smart money activity" description={`Latest moves, ${range.label}`} right={<Link href="/activity" className="text-xs text-primary hover:underline">Activity feed →</Link>}>
          {moves.length ? (
            <ul className="-mx-1 divide-y divide-border">
              {moves.slice(0, 7).map((m, i) => {
                const fresh = ageMs(m.tsIso) < DAY_MS;
                return (
                  <li key={`${m.txHash ?? m.tsIso}-${i}`} className="px-1 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", fresh ? "bg-primary shadow-[0_0_6px_var(--primary)]" : "bg-surface-3")} aria-label={fresh ? "New in the last 24 hours" : undefined} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          {m.wallet ? (
                            <Link href={`/wallets/${m.wallet}`} className="truncate text-sm font-medium hover:text-primary">{m.trader}</Link>
                          ) : (
                            <span className="truncate text-sm font-medium">{m.trader}</span>
                          )}
                          <span className="tabular shrink-0 text-sm font-semibold">${compact(m.usd)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          <span className={m.side === "BUY" ? "text-foreground/90" : "text-chart-2"}>{m.side === "BUY" ? "Bought" : "Sold"}</span> {m.outcome} at {m.pricePct}¢ ·{" "}
                          {m.eventSlug ? (
                            <a href={polymarketEventUrl(m.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-foreground">{m.title}</a>
                          ) : (
                            m.title
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground/80">#{m.rank} · {relative(m.tsIso)}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Quiet stretch" description={`No trades of $300+ from tracked traders in the last ${range.label}.`} />
          )}
        </Section>
      </div>

      <Section title="Top performing traders" description="Polymarket's profit leaderboard, with figures from each wallet's open positions" right={<Link href="/leaderboard" className="text-xs text-primary hover:underline">Full leaderboard →</Link>}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th scope="col" className="px-1 py-2 font-medium">Rank</th>
                <th scope="col" className="px-1 py-2 font-medium">Trader</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Win rate<sup>1</sup></th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Total profit</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Open ROI<sup>2</sup></th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Recent activity</th>
                <th scope="col" className="px-1 py-2 text-right font-medium"><span className="sr-only">Profile</span></th>
              </tr>
            </thead>
            <tbody>
              {topTraders.map((t) => (
                <tr key={t.wallet} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/40">
                  <td className="tabular px-1 py-2.5 font-mono text-xs text-muted-foreground">{String(t.rank).padStart(2, "0")}</td>
                  <td className="px-1 py-2.5"><TraderIdentity wallet={t.wallet} name={t.name} size={26} /></td>
                  <td className="tabular px-1 py-2.5 text-right text-muted-foreground" aria-label="Not published">—</td>
                  <td className="tabular px-1 py-2.5 text-right font-medium">${compact(t.pnl)}</td>
                  <td className={cn("tabular px-1 py-2.5 text-right", t.openRoi === null ? "text-muted-foreground" : t.openRoi >= 0 ? "text-foreground" : "text-chart-2")}>
                    {t.openRoi === null ? "—" : `${t.openRoi >= 0 ? "+" : ""}${pct(t.openRoi, 1)}`}
                  </td>
                  <td className="px-1 py-2.5 text-right text-xs text-muted-foreground">{t.lastActive ? relative(t.lastActive) : "No open positions"}</td>
                  <td className="px-1 py-2.5 text-right">
                    <Link href={`/wallets/${t.wallet}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                      Profile <ArrowUpRight className="size-3" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          <sup>1</sup> Polymarket&apos;s public API does not publish closed-trade outcomes, so EDGEWISE does not estimate a win rate. <sup>2</sup> Unrealized profit on currently open positions divided by their cost. It is not the wallet&apos;s lifetime return.
        </p>
      </Section>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your workspace</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Watchlist" right={<Link href="/watchlist" className="text-xs text-primary hover:underline">Manage →</Link>}>
            {watchlist.length ? (
              <ul className="space-y-2">
                {watchlist.slice(0, 6).map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={w.kind === "wallet" ? `/wallets/${w.refId}` : w.kind === "market" ? `/markets/${w.refId}` : w.kind === "player" ? `/sports/players/${w.refId}` : "/watchlist"} className="truncate hover:text-primary">{w.label}</Link>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{w.currentValue !== null ? pct(w.currentValue, 0) : w.kind}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing watched yet" description="Follow markets and players to track their changes here." action={<LinkButton href="/markets" size="sm" variant="outline">Browse markets</LinkButton>} />
            )}
          </Section>
          <Section title="Recently analyzed" right={<Link href="/analyst" className="text-xs text-primary hover:underline">Analyst →</Link>}>
            {recentConvos.length ? (
              <ul className="space-y-2">
                {recentConvos.map((c) => (
                  <li key={c.id}>
                    <Link href={`/analyst?c=${c.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary">
                      <span className="truncate">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relative(c.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Conversations with the AI Analyst appear here.</p>
            )}
          </Section>
          <Section title="Learning progress" right={<Link href="/academy" className="text-xs text-primary hover:underline">Academy →</Link>}>
            <ul className="space-y-2.5">
              {progress.byCourse.map((c) => {
                const course = COURSES.find((x) => x.slug === c.slug);
                return (
                  <li key={c.slug}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{course?.title ?? c.slug}</span>
                      <span className="tabular text-muted-foreground">{c.completed}/{c.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${c.total ? (c.completed / c.total) * 100 : 0}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>

      <div className="flex justify-end">
        <LinkButton href="/consensus" variant="outline" size="sm">
          See every consensus trade <ArrowRight className="size-4" />
        </LinkButton>
      </div>
    </div>
  );
}
