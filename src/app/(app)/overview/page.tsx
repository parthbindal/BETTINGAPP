import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, getWhaleHistory } from "@/lib/whales";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { listWatchlist } from "@/lib/watchlist";
import { Section, EmptyState } from "@/components/shared/page-header";
import { ActivityChart } from "@/components/intel/activity-chart";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { HeroSignal, SignalCard, staggerIndex } from "@/components/intel/signal";
import { CountUp, type CountFormat } from "@/components/motion/count-up";
import { TradeRow, TraderProfitList } from "@/components/intel/trade-row";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { LinkButton } from "@/components/ui/link-button";
import { pct } from "@/lib/format";
import { ageMs, dailyActivity, isInPlay, scanChange, splitSides, windowStart } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "3d", days: 3, label: "3 days" },
  { key: "7d", days: 7, label: "7 days" },
  { key: "10d", days: 10, label: "10 days" },
] as const;
const DAY_MS = 86_400_000;

function RangeSelector({ active }: { active: string }) {
  return (
    <nav className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Time window">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`/overview?range=${r.key}`}
          scroll={false}
          aria-current={r.key === active ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            r.key === active && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

/** One plain-language number with what it means underneath; delta only against a real earlier scan. */
function Glance({ value, format, label, sub, change, id }: { value: number; format: CountFormat; label: string; sub?: string; change?: { pct: number } | null; id: string }) {
  return (
    <div className="py-4 sm:px-5 lg:first:pl-0">
      <div className="flex items-baseline gap-2">
        <CountUp value={value} format={format} id={id} className="text-2xl font-semibold tracking-tight" />
        {change && Math.abs(change.pct) >= 0.005 && (
          <span className={cn("tabular text-xs font-medium", change.pct >= 0 ? "text-status-good" : "text-chart-2")}>
            {change.pct >= 0 ? "▲" : "▼"} {pct(Math.abs(change.pct), 0)}
            <span className="sr-only"> since the previous scan</span>
          </span>
        )}
      </div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireUser("/overview");
  const userId = session.user.id;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const [ent, whale, history, watchlist] = await Promise.all([getEntitlements(userId), getWhaleWatch(), getWhaleHistory(CONSENSUS_MIN_WALLETS), listWatchlist(userId)]);
  trackUsage("overview.view", userId);
  const pro = ent.limits.scanner;
  const firstName = session.user.name?.split(" ")[0];

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {/*
        A daily dashboard, so the header stays one line: the marketing sentence
        that used to sit here repeated the hero below it, and two competing
        headlines meant the first real data sat far down the page.
      */}
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here is where Polymarket&apos;s most profitable traders are putting their money.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeSelector active={range.key} />
        {pro && <WhaleRefreshButton />}
      </div>
    </div>
  );

  if (!whale) {
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState title="Getting the first scan ready" description="Your dashboard fills in after EDGEWISE finishes reading Polymarket's top 1,000 traders. This usually takes a few minutes." action={pro ? <WhaleRefreshButton /> : undefined} />
        </Section>
      </div>
    );
  }

  const p = whale.payload;
  const wallets = p.wallets ?? [];
  const active = wallets.filter((w) => w.positions > 0).length;
  const combinedPnl = wallets.reduce((s, w) => s + w.pnl, 0);
  const signals = p.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS);
  // Spotlight only clear agreement, ranked by dollars at risk: skip decided markets and ones where top traders sit on both sides.
  const split = splitSides(p.holdings, CONSENSUS_MIN_WALLETS);
  const live = signals.filter(isInPlay).filter((h) => !split.has(h.conditionId)).sort((x, y) => y.totalValue - x.totalValue);
  const featured = live[0];
  const more = live.slice(1, 4);
  const since = windowStart(range.days);
  const moves = p.recentMoves.filter((m) => Date.parse(m.tsIso) >= since);
  const flow = dailyActivity(p, range.days);
  const volume = flow.reduce((s, d) => s + d.buys + d.sells, 0);
  const trades = flow.reduce((s, d) => s + d.trades, 0);
  const topTraders = [...wallets].sort((a, b) => a.rank - b.rank).slice(0, 8);
  const sigHref = (tokenId: string) => `/consensus#sig-${tokenId}`;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        {header}
        <ScanFreshness generatedAt={p.generatedAt} note={`${p.tradersScanned.toLocaleString("en-US")} traders`} />
      </div>

      {/* The hero opens the page; every later block enters after it (.stagger-in, 40ms apart). */}
      <div className="stagger-in space-y-10">
        <section style={staggerIndex(0)}>
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" /> Biggest bet the top traders agree on
          </div>
          {featured ? (
            <HeroSignal h={featured} href={sigHref(featured.tokenId)} />
          ) : (
            <Section>
              <EmptyState title="No strong agreement right now" description={`A signal appears when ${CONSENSUS_MIN_WALLETS} or more top traders hold the same side of a market.`} />
            </Section>
          )}
        </section>

        <section style={staggerIndex(1)} aria-label={`At a glance, last ${range.label}`} className="card-surface grid divide-border/70 px-5 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:px-6 [&>*]:border-border/70 max-sm:divide-y">
          <Glance id="glance-signals" value={signals.length} format="int" label="bets the top traders agree on" sub={`${CONSENSUS_MIN_WALLETS}+ traders on one side`} change={scanChange(history, "consensusOutcomes")} />
          <Glance id={`glance-volume-${range.key}`} value={volume} format="usd" label={`traded in the last ${range.label}`} sub={`${trades.toLocaleString("en-US")} trades of $300 or more`} />
          <Glance id="glance-active" value={active} format="int" label="traders holding open bets" sub={`of the ${p.tradersScanned.toLocaleString("en-US")} we track`} change={scanChange(history, "activeWallets")} />
          <Glance id="glance-profit" value={combinedPnl} format="usd" label="profit these traders have made" sub="Polymarket leaderboard" />
        </section>

        {more.length > 0 && (
          <section style={staggerIndex(2)}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">More signals</h2>
                <p className="text-sm text-muted-foreground">The next biggest bets where many top traders are on the same side.</p>
              </div>
              <Link href="/consensus" className="shrink-0 text-sm font-medium text-primary hover:underline">
                All {signals.length} signals →
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {more.map((h) => (
                <SignalCard key={h.tokenId} h={h} href={sigHref(h.tokenId)} />
              ))}
            </div>
          </section>
        )}

        <div style={staggerIndex(3)} className="grid gap-4 xl:grid-cols-5">
          <Section title="Where the money is moving" description={`Dollars bought and sold each day by the top ${p.recentTraders ?? 100} traders`} className="xl:col-span-3">
            <ActivityChart data={flow} height={300} />
          </Section>
          <Section title="Just traded" description="Latest big moves by top traders" right={<Link href="/activity" className="text-xs font-medium text-primary hover:underline">Live trades →</Link>} className="xl:col-span-2">
            {moves.length ? (
              <div className="-my-3 divide-y divide-border/70">
                {moves.slice(0, 5).map((m, i) => (
                  <TradeRow key={`${m.txHash ?? m.tsIso}-${i}`} m={m} fresh={ageMs(m.tsIso) < DAY_MS / 4} action />
                ))}
              </div>
            ) : (
              <EmptyState title="Quiet stretch" description={`No trades of $300+ from top traders in the last ${range.label}.`} />
            )}
          </Section>
        </div>

        <div style={staggerIndex(4)} className="grid gap-4 lg:grid-cols-5">
          <Section title="Most profitable traders" description="Ranked by total profit on Polymarket" right={<Link href="/leaderboard" className="text-xs font-medium text-primary hover:underline">All traders →</Link>} className="lg:col-span-3">
            <TraderProfitList traders={topTraders} />
          </Section>
          <Section title="Your watchlist" right={<Link href="/watchlist" className="text-xs font-medium text-primary hover:underline">Open →</Link>} className="lg:col-span-2">
            {watchlist.length ? (
              <ul className="divide-y divide-border/70">
                {watchlist.slice(0, 6).map((w) => (
                  <li key={w.id}>
                    <Link href={w.kind === "wallet" ? `/wallets/${w.refId}` : w.kind === "market" ? `/markets/${w.refId}` : w.kind === "player" ? `/sports/players/${w.refId}` : "/watchlist"} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                      <span className="truncate">{w.label}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">{w.currentValue !== null ? pct(w.currentValue, 0) : w.kind === "wallet" ? "Trader" : w.kind}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Follow traders you trust" description="Open any trader and tap Follow. Their moves will show up here." action={<LinkButton href="/leaderboard" size="sm" variant="outline">Find traders <ArrowRight className="size-4" /></LinkButton>} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
