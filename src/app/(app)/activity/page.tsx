import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Users } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, type RecentMove } from "@/lib/whales";
import { Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { SidePill } from "@/components/intel/signal";
import { TradeRow } from "@/components/intel/trade-row";
import { ActivityChart } from "@/components/intel/activity-chart";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, relative } from "@/lib/format";
import { ageMs, dailyActivity, walletHref } from "@/lib/intel";
import { OpenOnPolymarket } from "@/components/intel/open-on-polymarket";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

type Params = { side?: string; cat?: string; min?: string };
const SIZES = [300, 1_000, 10_000, 50_000] as const;
const HOUR_MS = 3_600_000;
const FEED_LIMIT = 120;

function Chip({ params, patch, active, children }: { params: Params; patch: Partial<Params>; active: boolean; children: React.ReactNode }) {
  const q = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as Array<[string, string]>).toString();
  return (
    <Link
      href={q ? `/activity?${q}` : "/activity"}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Day heading relative to the scan's own date, so "Today" means the scan day. */
function dayLabel(day: string, scanDay: string, prevDay: string): string {
  if (day === scanDay) return "Today";
  if (day === prevDay) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireUser("/activity");
  const [ent, whale, sp] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), searchParams]);
  trackUsage("activity.view", session.user.id);
  const pro = ent.limits.scanner;
  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Live Trades</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every big trade by Polymarket&apos;s top 100 traders, newest first, plus the moments several of them jumped into the same bet.</p>
      </div>
      {pro && <WhaleRefreshButton />}
    </div>
  );

  if (!pro)
    return (
      <div className="space-y-6">
        {header}
        <UpgradeGate locked feature="Live trades from the top traders" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  if (!whale)
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState title="Getting the first scan ready" description="Trades appear after the first scan." action={<WhaleRefreshButton />} />
        </Section>
      </div>
    );

  const p = whale.payload;
  const params: Params = { side: sp.side, cat: sp.cat, min: sp.min };
  const min = SIZES.find((s) => String(s) === sp.min) ?? 300;
  const categories = [...new Set(p.recentMoves.map((m) => m.category))].sort();
  const moves = p.recentMoves
    .filter((m) => !sp.side || (sp.side === "buy" ? m.side === "BUY" : m.side === "SELL"))
    .filter((m) => !sp.cat || m.category === sp.cat)
    .filter((m) => m.usd >= min);
  const clusters = (p.clusters ?? []).filter((c) => !sp.cat || c.category === sp.cat).slice(0, 8);

  // Last 24 hours of the (filtered) feed, for the buy/sell balance.
  const day = moves.filter((m) => ageMs(m.tsIso) < 24 * HOUR_MS);
  const bought = day.filter((m) => m.side === "BUY").reduce((s, m) => s + m.usd, 0);
  const sold = day.filter((m) => m.side === "SELL").reduce((s, m) => s + m.usd, 0);
  const buyShare = bought + sold > 0 ? bought / (bought + sold) : 0.5;
  const flow = dailyActivity(p, 10);

  // Group the feed by UTC day.
  const scanDay = p.generatedAt.slice(0, 10);
  const prevDay = new Date(Date.parse(`${scanDay}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const groups: Array<{ day: string; items: RecentMove[] }> = [];
  for (const m of moves.slice(0, FEED_LIMIT)) {
    const d = m.tsIso.slice(0, 10);
    const g = groups.at(-1);
    if (g && g.day === d) g.items.push(m);
    else groups.push({ day: d, items: [m] });
  }

  return (
    <div className="space-y-6">
      {header}
      <ScanFreshness generatedAt={p.generatedAt} note={`top ${p.recentTraders ?? 100} traders · refreshed with each scan`} />

      {/* Buy / sell balance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Last 24 hours" description="Big trades matching your filters">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="size-3.5 text-status-good" aria-hidden="true" /> Bought
              </div>
              <div className="tabular mt-1 text-2xl font-semibold">${compact(bought)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDownLeft className="size-3.5 text-chart-2" aria-hidden="true" /> Sold
              </div>
              <div className="tabular mt-1 text-2xl font-semibold">${compact(sold)}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${Math.round(buyShare * 100)}% of the dollars were buys`}>
              <span className="bg-status-good/80" style={{ width: `${buyShare * 100}%` }} />
              <span className="bg-chart-2/80" style={{ width: `${(1 - buyShare) * 100}%` }} />
            </div>
            <p className="mt-2 text-sm">
              <span className="tabular font-semibold">{Math.round(buyShare * 100)}%</span> <span className="text-muted-foreground">of the money was buying, across {day.length.toLocaleString("en-US")} trades.</span>
            </p>
          </div>
        </Section>
        <Section title="Money moved per day" description="Dollars bought and sold by the top traders, last 10 days" className="lg:col-span-2">
          <ActivityChart data={flow} height={200} />
        </Section>
      </div>

      {/* Clusters */}
      {clusters.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Traders moving together</h2>
          <p className="text-sm text-muted-foreground">Two or more top traders bought the same side within 72 hours.</p>
          <div className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {clusters.map((c) => (
              <article key={c.tokenId} className="card-surface flex w-72 shrink-0 snap-start flex-col p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-brand-cyan">
                  <Users className="size-3.5" aria-hidden="true" /> {c.wallets.length} traders · ${compact(c.totalUsd)}
                </div>
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-medium">{c.title}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  All bought <SidePill outcome={c.outcome} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex">
                    {c.wallets.slice(0, 6).map((w, i) => (
                      <Link key={w.wallet} href={walletHref(w.wallet)} title={`#${w.rank} ${w.trader} · $${compact(w.usd)}`} className={cn(i > 0 && "-ml-2")}>
                        <TraderAvatar wallet={w.wallet} name={w.trader} size={26} className="ring-2 ring-card" />
                      </Link>
                    ))}
                  </span>
                  <span className="text-[11px] text-muted-foreground">latest {relative(c.lastIso)}</span>
                </div>
                <OpenOnPolymarket className="mt-4 self-start" variant="compact" title={c.title} outcome={c.outcome} eventSlug={c.eventSlug} marketSlug={c.marketSlug} />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      <Section>
        <div className="mb-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">All trades</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {[["", "Buys & sells"], ["buy", "Buys"], ["sell", "Sells"]].map(([k, l]) => (
              <Chip key={k} params={params} patch={{ side: k }} active={(sp.side ?? "") === k}>{l}</Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            {SIZES.map((s) => (
              <Chip key={s} params={params} patch={{ min: s === 300 ? "" : String(s) }} active={s === min}>${compact(s)}+</Chip>
            ))}
          </div>
        </div>
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip params={params} patch={{ cat: "" }} active={!sp.cat}>Every topic</Chip>
          {categories.map((c) => (
            <Chip key={c} params={params} patch={{ cat: c }} active={sp.cat === c}>{c}</Chip>
          ))}
        </div>
        {groups.length ? (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.day}>
                <h3 className="sticky top-14 z-10 -mx-1 bg-card/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                  {dayLabel(g.day, scanDay, prevDay)} <span className="tabular font-normal normal-case tracking-normal">· {g.items.length} trades</span>
                </h3>
                <div className="divide-y divide-border/70">
                  {g.items.map((m, i) => (
                    <TradeRow key={`${m.txHash ?? m.tsIso}-${i}`} m={m} fresh={ageMs(m.tsIso) < 6 * HOUR_MS} showTx action />
                  ))}
                </div>
              </div>
            ))}
            {moves.length > FEED_LIMIT && <p className="text-center text-xs text-muted-foreground">Showing the latest {FEED_LIMIT} of {moves.length.toLocaleString("en-US")} trades. Raise the minimum size to see bigger ones.</p>}
          </div>
        ) : (
          <EmptyState title="No trades match" description="Lower the minimum size or pick another topic." />
        )}
      </Section>
    </div>
  );
}
