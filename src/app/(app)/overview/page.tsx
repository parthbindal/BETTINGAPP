import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, getWhaleHistory } from "@/lib/whales";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { listWatchlist } from "@/lib/watchlist";
import { Section, EmptyState } from "@/components/shared/page-header";
import { ActivityChart } from "@/components/intel/activity-chart";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { SignalCard, signalKind } from "@/components/intel/signal";
import { TradeRow, TraderProfitList } from "@/components/intel/trade-row";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { LinkButton } from "@/components/ui/link-button";
import { compact, pct } from "@/lib/format";
import { ageMs, dailyActivity, isInPlay, scanChange, windowStart } from "@/lib/intel";
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

/** One plain-language number with what it means underneath. */
function Glance({ value, label, sub, change }: { value: string; label: string; sub?: string; change?: { pct: number } | null }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
        {change && Math.abs(change.pct) >= 0.005 && (
          <span className={cn("tabular text-xs font-medium", change.pct >= 0 ? "text-status-good" : "text-chart-2")}>
            {change.pct >= 0 ? "▲" : "▼"} {pct(Math.abs(change.pct), 0)}
            <span className="sr-only"> since the previous scan</span>
          </span>
        )}
      </div>
      <div className="text-sm">{label}</div>
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
      <div>
        <p className="text-sm text-muted-foreground">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</p>
        <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">What the smartest money is betting on</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">We watch Polymarket&apos;s 1,000 most profitable traders and show you where they agree, what they just bought, and how it&apos;s going.</p>
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
  const signals = p.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS).sort((a, b) => b.holders - a.holders || b.totalValue - a.totalValue);
  const live = signals.filter(isInPlay);
  const featured = live.find((h) => signalKind(h) === "now") ?? live[0];
  const more = live.filter((h) => h !== featured).slice(0, 3);
  const since = windowStart(range.days);
  const moves = p.recentMoves.filter((m) => Date.parse(m.tsIso) >= since);
  const flow = dailyActivity(p, range.days);
  const volume = flow.reduce((s, d) => s + d.buys + d.sells, 0);
  const trades = flow.reduce((s, d) => s + d.trades, 0);
  const topTraders = [...wallets].sort((a, b) => a.rank - b.rank).slice(0, 8);
  const sigHref = (tokenId: string) => `/consensus#sig-${tokenId}`;

  return (
    <div className="space-y-8">
      {header}
      <ScanFreshness generatedAt={p.generatedAt} note={`${p.tradersScanned.toLocaleString("en-US")} top traders`} />

      {/* Hero: the single strongest signal, next to the week at a glance */}
      <div className="grid gap-4 lg:grid-cols-3">
        {featured ? (
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" /> Biggest signal right now
            </div>
            <SignalCard h={featured} href={sigHref(featured.tokenId)} featured className="h-[calc(100%-1.5rem)]" />
          </div>
        ) : (
          <Section className="lg:col-span-2">
            <EmptyState title="No strong agreement right now" description={`A signal appears when ${CONSENSUS_MIN_WALLETS} or more top traders hold the same side of a market.`} />
          </Section>
        )}
        <Section title="At a glance" description={`Last ${range.label}`}>
          <div className="divide-y divide-border/70">
            <Glance value={signals.length.toLocaleString("en-US")} label="bets the top traders agree on" sub={`${CONSENSUS_MIN_WALLETS}+ traders on the same side`} change={scanChange(history, "consensusOutcomes")} />
            <Glance value={`$${compact(volume)}`} label="traded by the top 100" sub={`${trades.toLocaleString("en-US")} trades of $300 or more`} />
            <Glance value={active.toLocaleString("en-US")} label="traders with money on the line" sub={`of the ${p.tradersScanned.toLocaleString("en-US")} we track`} change={scanChange(history, "activeWallets")} />
            <Glance value={`$${compact(combinedPnl)}`} label="profit these traders have made" sub="Polymarket leaderboard" />
          </div>
        </Section>
      </div>

      {/* More signals */}
      {more.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">More signals</h2>
              <p className="text-sm text-muted-foreground">Other bets where many top traders are on the same side.</p>
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

      {/* Money flow + live trades */}
      <div className="grid gap-4 xl:grid-cols-5">
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

      {/* Leaders + watchlist */}
      <div className="grid gap-4 lg:grid-cols-5">
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
  );
}
