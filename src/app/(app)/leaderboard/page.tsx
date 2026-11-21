import { Info } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { LeaderboardTable, type LeaderRow } from "@/components/intel/leaderboard-table";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, pct, relative } from "@/lib/format";
import { trackUsage } from "@/lib/ops";
import Link from "next/link";
import { Medal } from "lucide-react";
import type { WalletStat } from "@/lib/whales";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { TraderProfitList } from "@/components/intel/trade-row";
import { walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";

const PLACE = ["text-status-warning", "text-foreground/80", "text-chart-2"] as const;
const PLACE_NAME = ["1st", "2nd", "3rd"] as const;

/** The top three as large cards: avatar, profit, and how their open bets are doing. */
function Podium({ top }: { top: WalletStat[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {top.map((t, i) => (
        <li key={t.wallet}>
          <Link
            href={walletHref(t.wallet)}
            className={cn(
              "card-surface group flex h-full flex-col items-center p-6 text-center transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              i === 0 && "border-status-warning/30",
            )}
          >
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em]", PLACE[i])}>
              <Medal className="size-4" aria-hidden="true" /> {PLACE_NAME[i]}
            </span>
            <TraderAvatar wallet={t.wallet} name={t.name} size={64} className="mt-4" />
            <span className="mt-3 max-w-full truncate text-base font-semibold group-hover:text-primary">{t.name}</span>
            <span className="tabular mt-3 text-3xl font-semibold tracking-tight">${compact(t.pnl)}</span>
            <span className="text-xs text-muted-foreground">total profit</span>
            <span className="mt-4 grid w-full grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs">
              <span>
                <span className="tabular block font-medium">{t.positions}</span>
                <span className="text-muted-foreground">open bets</span>
              </span>
              <span>
                <span className={cn("tabular block font-medium", t.openRoi === null ? "" : t.openRoi >= 0 ? "text-status-good" : "text-chart-2")}>
                  {t.openRoi === null ? "—" : `${t.openRoi >= 0 ? "▲ +" : "▼ "}${pct(Math.abs(t.openRoi), Math.abs(t.openRoi) < 0.1 ? 1 : 0)}`}
                </span>
                <span className="text-muted-foreground">on open bets</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

const FREE_ROWS = 25;

export default async function LeaderboardPage() {
  const session = await requireUser("/leaderboard");
  const [ent, whale] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch()]);
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

  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ScanFreshness generatedAt={whale.payload.generatedAt} />
        <span className="tabular text-xs text-muted-foreground">{wallets.length.toLocaleString("en-US")} wallets tracked · {wallets.filter((w) => w.positions > 0).length.toLocaleString("en-US")} with open positions</span>
      </div>

      <Podium top={ranked.slice(0, 3)} />

      <Section title="Ranks 4 to 12" description="Total profit on Polymarket">
        <TraderProfitList traders={ranked.slice(3, 12)} />
      </Section>

      <Section title="Every tracked trader" description="Search, sort and compare">
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
