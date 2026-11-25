import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { keepScanFresh, getWhaleWatch, getWhaleHistory } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { listWatchlist } from "@/lib/watchlist";
import { Section, PageSection, EmptyState } from "@/components/shared/page-header";
import { StatBand, ScanDelta } from "@/components/shared/stat-band";
import { ActivityChart } from "@/components/intel/activity-chart";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { HeroSignal, staggerIndex } from "@/components/intel/signal";
import { ConsensusLedger } from "@/components/intel/consensus-ledger";
import { CountUp } from "@/components/motion/count-up";
import { TradeRow } from "@/components/intel/trade-row";
import { TraderProfitList } from "@/components/intel/trader-profit-list";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { LinkButton } from "@/components/ui/link-button";
import { compact, pct } from "@/lib/format";
import { ageMs, dailyActivity, isInPlay, scanChange, splitSides, walletHref, windowStart, flowCaption } from "@/lib/intel";
import type { WalletStat } from "@/lib/whales";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

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

/**
 * Who to follow when you follow no one, which is every new member. The empty
 * watchlist is the default state of this panel, so it says what will appear
 * here and offers real traders to start with: the most profitable ones holding
 * open bets in the latest scan (a trader with nothing open has nothing to follow yet).
 */
function FollowSuggestions({ wallets }: { wallets: WalletStat[] }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">Follow a trader and every trade they make of $1,000 or more shows up here and in your alerts. The most profitable traders holding open bets right now:</p>
      {wallets.length ? (
        <ul className="mt-3 divide-y divide-border/60">
          {wallets.map((w) => (
            <li key={w.wallet}>
              <Link href={walletHref(w.wallet)} className="group flex items-center gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <TraderAvatar wallet={w.wallet} name={w.name} size={28} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">{w.name}</span>
                  <span className="tabular block text-[11px] text-muted-foreground">
                    #{w.rank} all-time · {w.positions} open {w.positions === 1 ? "bet" : "bets"} · ${compact(w.openValue)} in play
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">None of the top traders held an open bet in the last scan. Suggestions return with the next hourly scan.</p>
      )}
    </div>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireUser("/overview");
  const userId = session.user.id;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const [ent, whale, history, watchlist] = await Promise.all([getEntitlements(userId), getWhaleWatch(), getWhaleHistory(CONSENSUS_MIN_WALLETS), listWatchlist(userId)]);
  keepScanFresh(whale?.ageMs);
  keepAlertsFlowing();
  trackUsage("overview.view", userId);
  const pro = ent.limits.scanner;
  const firstName = session.user.name?.split(" ")[0];

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {/* A daily dashboard: one line of header, then the data. */}
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-semibold sm:text-3xl">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
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
          <EmptyState
            title="Reading the top 1,000 traders"
            description="Your dashboard fills in when EDGEWISE finishes its first scan of Polymarket's most profitable wallets: every open bet they hold, where they agree, and what they just traded."
            when="Usually a few minutes · then every hour"
            action={pro ? <WhaleRefreshButton /> : undefined}
          />
        </Section>
      </div>
    );
  }

  const p = whale.payload;
  const wallets = p.wallets ?? [];
  const tracked = p.tradersScanned;
  const active = wallets.filter((w) => w.positions > 0).length;
  const combinedPnl = wallets.reduce((s, w) => s + w.pnl, 0);
  // Done bets (decided price, or market ended) are not signals: the count matches the Signals page's default view.
  const signals = p.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS && isInPlay(h));
  // Spotlight only clear agreement, ranked by dollars at risk: skip markets where top traders sit on both sides.
  const split = splitSides(p.holdings, CONSENSUS_MIN_WALLETS);
  const live = signals.filter((h) => !split.has(h.conditionId)).sort((x, y) => y.totalValue - x.totalValue);
  const featured = live[0];
  const more = live.slice(1, 6);
  const since = windowStart(range.days);
  const moves = p.recentMoves.filter((m) => Date.parse(m.tsIso) >= since);
  // "Just traded" headlines big moves: one per trader (a busy bot otherwise fills every row), $1K+,
  // and not 97¢+ / 3¢- fills on markets that are already decided.
  const seenTraders = new Set<string>();
  const bigMoves = moves
    .filter((m) => m.usd >= 1_000 && m.pricePct > 3 && m.pricePct < 97)
    .filter((m) => {
      const who = m.wallet ?? m.trader;
      if (seenTraders.has(who)) return false;
      seenTraders.add(who);
      return true;
    })
    .slice(0, 5);
  const flow = dailyActivity(p, range.days);
  const volume = flow.reduce((s, d) => s + d.buys + d.sells, 0);
  const trades = flow.reduce((s, d) => s + d.trades, 0);
  const ranked = [...wallets].sort((a, b) => a.rank - b.rank);
  const topTraders = ranked.slice(0, 8);
  const suggestions = ranked.filter((w) => w.scanned !== false && w.positions > 0).slice(0, 4);
  const sigHref = (h: { tokenId: string }) => `/consensus/${h.tokenId}`;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        {header}
        <ScanFreshness generatedAt={p.generatedAt} note={`${tracked.toLocaleString("en-US")} traders · ${active.toLocaleString("en-US")} holding open bets`} />
      </div>

      {/* The hero opens the page; every later block enters after it (.stagger-in, 40ms apart). */}
      <div className="stagger-in space-y-12">
        <section style={staggerIndex(0)}>
          <div className="label-micro mb-3">Biggest bet the top traders agree on</div>
          {featured ? (
            <HeroSignal h={featured} href={sigHref(featured)} />
          ) : (
            <Section>
              <EmptyState
                title="No clear agreement right now"
                description={`A signal appears when ${CONSENSUS_MIN_WALLETS} or more of the ${tracked.toLocaleString("en-US")} top traders hold the same side of a market still in play. Right now they are spread out or on both sides.`}
                when="Re-checked every hour"
              />
            </Section>
          )}
        </section>

        <section style={staggerIndex(1)} aria-label={`At a glance, last ${range.label}`} className="border-y border-border/60">
          <StatBand
            stats={[
              {
                label: "Signals right now",
                // No scan-to-scan delta here: the stored history counts decided markets too, so it would compare unlike things.
                value: <CountUp value={signals.length} id="glance-signals" />,
                foot: `Live markets where ${CONSENSUS_MIN_WALLETS}+ of the ${tracked.toLocaleString("en-US")} hold one side`,
              },
              {
                label: `Traded, last ${range.label}`,
                value: <CountUp value={volume} format="usd" id={`glance-volume-${range.key}`} />,
                foot: `${trades.toLocaleString("en-US")} trades of $300 or more`,
              },
              {
                label: "Holding open bets",
                value: (
                  <>
                    <CountUp value={active} id="glance-active" />
                    <ScanDelta change={scanChange(history, "activeWallets")} />
                  </>
                ),
                foot: `Of the ${tracked.toLocaleString("en-US")} traders we track`,
              },
              { label: "Their all-time profit", value: <CountUp value={combinedPnl} format="usd" id="glance-profit" />, foot: "Combined, from Polymarket's public board" },
            ]}
          />
        </section>

        {more.length > 0 && (
          <div style={staggerIndex(2)}>
            <PageSection
              title="More signals"
              description="The next biggest bets where many top traders hold the same side, ranked by the money on it."
              right={
                <Link href="/consensus" className="text-sm font-medium text-primary hover:underline">
                  All {signals.length} signals →
                </Link>
              }
            >
              <ConsensusLedger label="More signals" rows={more} tracked={tracked} href={sigHref} />
            </PageSection>
          </div>
        )}

        <div style={staggerIndex(3)} className="grid gap-4 xl:grid-cols-5">
          <Section title="Where the money is moving" description={flowCaption(p)} className="xl:col-span-3">
            <ActivityChart data={flow} height={300} />
          </Section>
          <Section
            title="Just traded"
            description="Latest big moves by top traders"
            right={
              <Link href="/activity" className="text-xs font-medium text-primary hover:underline">
                Live trades →
              </Link>
            }
            className="xl:col-span-2"
          >
            {bigMoves.length ? (
              <div className="-my-3 divide-y divide-border/70">
                {bigMoves.map((m, i) => (
                  <TradeRow key={`${m.txHash ?? m.tsIso}-${i}`} m={m} fresh={ageMs(m.tsIso) < DAY_MS / 4} action />
                ))}
              </div>
            ) : (
              <EmptyState title="A quiet stretch" description={`No top trader has made a trade of $1,000 or more in the last ${range.label} on a market still in play. Trades are checked about every 20 minutes.`} when="Try a longer window above" />
            )}
          </Section>
        </div>

        <div style={staggerIndex(4)} className="grid gap-4 lg:grid-cols-5">
          <Section
            title="Most profitable traders"
            description="Ranked by all-time profit on Polymarket"
            right={
              <Link href="/leaderboard" className="text-xs font-medium text-primary hover:underline">
                All traders →
              </Link>
            }
            className="lg:col-span-3"
          >
            <TraderProfitList traders={topTraders} />
          </Section>
          <Section
            title={watchlist.length ? "Your watchlist" : "Traders to follow"}
            right={
              <Link href={watchlist.length ? "/watchlist" : "/leaderboard"} className="text-xs font-medium text-primary hover:underline">
                {watchlist.length ? "Open →" : "All traders →"}
              </Link>
            }
            className="lg:col-span-2"
          >
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
              <>
                <FollowSuggestions wallets={suggestions} />
                <LinkButton href="/leaderboard" size="sm" variant="outline" className="mt-4">
                  Browse all {tracked.toLocaleString("en-US")} <ArrowRight className="size-3.5" />
                </LinkButton>
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
