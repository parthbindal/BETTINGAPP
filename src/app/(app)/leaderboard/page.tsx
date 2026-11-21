import { Info } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { LeaderboardTable, type LeaderRow } from "@/components/intel/leaderboard-table";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { relative } from "@/lib/format";
import { trackUsage } from "@/lib/ops";

const FREE_ROWS = 25;

export default async function LeaderboardPage() {
  const session = await requireUser("/leaderboard");
  const [ent, whale] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch()]);
  trackUsage("leaderboard.view", session.user.id);
  const pro = ent.limits.scanner;

  const header = (
    <PageHeader
      eyebrow="Smart money"
      title="Leaderboard"
      description="Polymarket's most profitable wallets, with figures read from each wallet's open positions."
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

  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ScanFreshness generatedAt={whale.payload.generatedAt} />
        <span className="tabular text-xs text-muted-foreground">{wallets.length.toLocaleString("en-US")} wallets tracked · {wallets.filter((w) => w.positions > 0).length.toLocaleString("en-US")} with open positions</span>
      </div>

      <Section>
        <LeaderboardTable rows={rows} />
        <div className="mt-4 flex gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            Ranking and total profit come from Polymarket&apos;s public profit leaderboard. Polymarket now publishes a single ranking, with no day, week or month windows, so this board has no time-range filter. Open ROI, positions, average size, exposure and last activity are read from each wallet&apos;s positions of $100 or more. Win rate is not shown because closed-trade outcomes are not published.
          </p>
        </div>
      </Section>

      {!pro && (
        <UpgradeGate locked feature={`The full leaderboard of all ${wallets.length.toLocaleString("en-US")} tracked wallets`} requiredTier="pro">
          <span />
        </UpgradeGate>
      )}
    </div>
  );
}
