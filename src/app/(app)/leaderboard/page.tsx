import { Info } from "lucide-react";
import { HOT_PERIODS } from "@/components/intel/hot-traders";
import { getHotTradersCached } from "@/lib/data/public-cache";
import { requireUser, getEntitlements } from "@/lib/session";
import { keepScanFresh, getWhaleWatch } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { SCAN_STALE_MS } from "@/components/intel/scan-freshness";
import { LiveBoardProvider, LiveBoardStatus } from "@/components/intel/live-board";
import { LiveHotBoard, LivePodium, LiveRanks } from "@/components/intel/live-top-traders";
import { LeaderboardTable, type LeaderRow } from "@/components/intel/leaderboard-table";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { relative } from "@/lib/format";
import { ageMs } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const FREE_ROWS = 25;
/** Scanned rows handed to the live top sections, so a trader climbing a few places still has one. */
const TOP_ROWS = 50;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ hot?: string }> }) {
  const session = await requireUser("/leaderboard");
  const sp = await searchParams;
  const hotPeriod = HOT_PERIODS.find((h) => h.key === sp.hot) ?? HOT_PERIODS[1]!;
  const [ent, whale, hot] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), getHotTradersCached(hotPeriod.api)]);
  keepScanFresh(whale?.ageMs);
  keepAlertsFlowing();
  trackUsage("leaderboard.view", session.user.id);
  const pro = ent.limits.scanner;

  const header = (
    <PageHeader
      title="Top Traders"
      description="The most profitable people on Polymarket. Tap anyone to see what they hold and follow their moves."
      actions={pro ? <WhaleRefreshButton /> : undefined}
    />
  );

  const wallets = whale?.payload.wallets ?? [];
  if (!whale || !wallets.length) {
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState title="No wallet figures yet" description="The leaderboard fills in after the next scan of Polymarket's top 1,000 wallets." action={pro ? <WhaleRefreshButton /> : undefined} />
        </Section>
      </div>
    );
  }

  const ranked = [...wallets].sort((a, b) => a.rank - b.rank);
  const rows: LeaderRow[] = (pro ? ranked : ranked.slice(0, FREE_ROWS)).map((w) => ({
    wallet: w.wallet,
    name: w.name,
    rank: w.rank,
    pnl: w.pnl,
    openRoi: w.openRoi,
    openCost: w.openCost,
    positions: w.positions,
    avgPosition: w.avgPosition,
    openValue: w.openValue,
    lastActiveMs: w.lastActive ? Date.parse(w.lastActive) : null,
    lastActiveLabel: w.lastActive ? relative(w.lastActive) : null,
    topCategory: w.topCategory,
  }));
  const rankOf = new Map(ranked.map((w) => [w.wallet.toLowerCase(), w.rank]));
  const hotRanks = Object.fromEntries(hot.map((t) => [t.wallet.toLowerCase(), rankOf.get(t.wallet.toLowerCase())]).filter((e): e is [string, number] => e[1] !== undefined));
  const generatedAt = whale.payload.generatedAt;

  return (
    <LiveBoardProvider hotWindow={hotPeriod.api} scanGeneratedAt={generatedAt}>
      <div className="space-y-6">
        {header}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LiveBoardStatus scanGeneratedAt={generatedAt} scanLabel={relative(generatedAt)} scanStale={ageMs(generatedAt) > SCAN_STALE_MS} />
          <span className="tabular text-xs text-muted-foreground">{wallets.length.toLocaleString("en-US")} wallets tracked · {wallets.filter((w) => w.positions > 0).length.toLocaleString("en-US")} with open positions</span>
        </div>

        <LivePodium rows={rows.slice(0, TOP_ROWS)} />

        <div className="grid gap-4 lg:grid-cols-5">
          <Section title="Ranks 4 to 12" description="All-time profit on Polymarket, next to the leader's" className="lg:col-span-3">
            <LiveRanks rows={rows.slice(0, TOP_ROWS)} />
          </Section>
          <Section title="Hot right now" description="Biggest winners on Polymarket's shorter boards" className="lg:col-span-2">
            <LiveHotBoard initial={hot} period={hotPeriod.key} ranks={hotRanks} />
          </Section>
        </div>

        <Section title="Every tracked trader" description="Search, sort and compare">
          <LeaderboardTable rows={rows} />
          <div className="mt-4 flex gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p>
              Rank and all-time profit come live from Polymarket&apos;s public profit leaderboard: this page checks it every 2 minutes while it is open, and a figure changes when Polymarket recalculates the board. &ldquo;Hot right now&rdquo; uses its day, week and month windows. Open ROI, positions, average size and exposure are read from each wallet&apos;s open positions of $100 or more in an hourly scan; open ROI is computed the way the trader&apos;s Polymarket profile shows it. Last active is the newest trade we can see: on an open bet, or for the top 100, any trade in the last 10 days. Win rate is not shown because closed-trade outcomes are not published.
            </p>
          </div>
        </Section>

        {!pro && (
          <UpgradeGate locked feature={`The full leaderboard of all ${wallets.length.toLocaleString("en-US")} tracked wallets`} requiredTier="pro">
            <span />
          </UpgradeGate>
        )}
      </div>
    </LiveBoardProvider>
  );
}
