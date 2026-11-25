import { HOT_PERIODS } from "@/components/intel/hot-traders";
import { getHotTradersCached } from "@/lib/data/public-cache";
import { requireUser, getEntitlements } from "@/lib/session";
import { keepScanFresh, getWhaleWatch } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { PageHeader, PageSection, Section, EmptyState } from "@/components/shared/page-header";
import { StatBand } from "@/components/shared/stat-band";
import { UpgradeGate } from "@/components/shared/badges";
import { SCAN_STALE_MS } from "@/components/intel/scan-freshness";
import { LiveBoardProvider, LiveBoardStatus } from "@/components/intel/live-board";
import { LiveHotBoard } from "@/components/intel/live-top-traders";
import { LeaderboardTable, type LeaderRow } from "@/components/intel/leaderboard-table";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, relative } from "@/lib/format";
import { ageMs } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const FREE_ROWS = 25;

/** How each column is sourced. Numbered like the track record's scoring rules, because these are the same kind of promise. */
const METHOD: Array<{ head: string; body: string }> = [
  { head: "Rank and all-time profit are Polymarket's", body: "Read live from Polymarket's public profit leaderboard, every 2 minutes while this page is open. A figure moves when Polymarket recalculates its board, about once an hour." },
  { head: "Open bets come from the hourly scan", body: "Open return, positions, average size and exposure are read from each wallet's open positions of $100 or more. Open return is computed the way the trader's own Polymarket profile shows it." },
  { head: "Last active is the newest trade we can see", body: "On an open bet, or for the top 100, any trade in the last 10 days. A trader with nothing open and no recent trade shows none." },
  { head: "There is no win rate, on purpose", body: "Polymarket does not publish the outcome of each wallet's closed trades, so a win rate here would be an estimate. We would rather show nothing than a number we made up." },
];

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ hot?: string }> }) {
  const session = await requireUser("/leaderboard");
  const sp = await searchParams;
  const hotPeriod = HOT_PERIODS.find((h) => h.key === sp.hot) ?? HOT_PERIODS[1]!;
  const [ent, whale, hot] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), getHotTradersCached(hotPeriod.api)]);
  keepScanFresh(whale?.ageMs);
  keepAlertsFlowing();
  trackUsage("leaderboard.view", session.user.id);
  const pro = ent.limits.scanner;

  const header = <PageHeader title="Top Traders" description="The most profitable people on Polymarket, ranked live. Open anyone to see what they hold and follow their moves." actions={pro ? <WhaleRefreshButton /> : undefined} />;

  const wallets = whale?.payload.wallets ?? [];
  if (!whale || !wallets.length) {
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState
            title="Reading Polymarket's top 1,000"
            description="This board lists every tracked trader with their all-time profit and what they hold right now. It fills in when the first scan of their wallets finishes."
            when="Usually a few minutes · then every hour"
            action={pro ? <WhaleRefreshButton /> : undefined}
          />
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
  const holding = wallets.filter((w) => w.positions > 0);
  const exposure = holding.reduce((s, w) => s + w.openValue, 0);
  const combined = wallets.reduce((s, w) => s + w.pnl, 0);
  const leader = ranked[0]!;

  return (
    <LiveBoardProvider hotWindow={hotPeriod.api} scanGeneratedAt={generatedAt}>
      <div className="space-y-10">
        <div className="space-y-3">
          {header}
          <LiveBoardStatus scanGeneratedAt={generatedAt} scanLabel={`${relative(generatedAt)}, updates on its own when you open the app and every hour`} scanStale={ageMs(generatedAt) > SCAN_STALE_MS} />
        </div>

        <section aria-label="The board at a glance" className="border-y border-border/60">
          <StatBand
            stats={[
              { label: "Traders tracked", value: wallets.length.toLocaleString("en-US"), foot: "Polymarket's all-time profit board" },
              { label: "Holding open bets", value: holding.length.toLocaleString("en-US"), foot: `Of ${wallets.length.toLocaleString("en-US")}, positions of $100 or more` },
              { label: "Open exposure", value: `$${compact(exposure)}`, foot: `Current value of those ${holding.length.toLocaleString("en-US")} traders' bets` },
              { label: "Combined all-time profit", value: `$${compact(combined)}`, foot: `#1 is ${leader.name} at $${compact(leader.pnl)}` },
            ]}
          />
        </section>

        <PageSection title="Every tracked trader" description={pro ? "Sorted by all-time profit. Search by name or wallet, or rank by open return, activity or recency." : `The top ${FREE_ROWS} by all-time profit. Search, sort and compare.`}>
          <div className="card-surface min-w-0 p-4 sm:p-5">
            <LeaderboardTable rows={rows} />
          </div>
          {!pro && (
            <div className="mt-4">
              <UpgradeGate locked feature={`The full board of all ${wallets.length.toLocaleString("en-US")} tracked traders`} requiredTier="pro">
                <span />
              </UpgradeGate>
            </div>
          )}
        </PageSection>

        <div className="grid gap-10 lg:grid-cols-2">
          <PageSection title="Hot right now" description="Biggest winners on Polymarket's shorter boards. The badge marks traders who are also in the all-time top 1,000.">
            <div className="card-surface p-5">
              <LiveHotBoard initial={hot} period={hotPeriod.key} ranks={hotRanks} />
            </div>
          </PageSection>
          <PageSection title="How these figures are read" description="Each column has one source, stated here, so any number can be checked on Polymarket.">
            <ol className="space-y-6">
              {METHOD.map((m, i) => (
                <li key={m.head} className="flex gap-4">
                  <span className="figure mt-0.5 shrink-0 text-sm font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-base font-semibold">{m.head}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </PageSection>
        </div>
      </div>
    </LiveBoardProvider>
  );
}
