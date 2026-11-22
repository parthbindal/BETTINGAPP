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

/**
 * The top three. Rank 1 takes the full width of the row on desktop and prints
 * its profit at hero size; 2nd and 3rd sit beneath it, smaller. A podium where
 * every step is the same height is not a podium.
 *
 * A trader with no open positions of $100+ gets one plain line, never a "0"
 * and an em dash filling a two-column grid.
 */
function Podium({ top }: { top: WalletStat[] }) {
  const [first, ...rest] = top;
  if (!first) return null;
  return (
    <div className="space-y-4">
      <PodiumCard t={first} place={0} lead />
      {rest.length > 0 && (
        <ol className="grid gap-4 sm:grid-cols-2">
          {rest.map((t, i) => (
            <li key={t.wallet}>
              <PodiumCard t={t} place={i + 1} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PodiumCard({ t, place, lead = false }: { t: WalletStat; place: number; lead?: boolean }) {
  return (
    <Link
      href={walletHref(t.wallet)}
      className={cn(
        // Wraps rather than squeezing: on a narrow screen the profit drops to
        // its own line instead of truncating the trader's name.
        "card-surface lift group flex h-full flex-wrap items-center gap-x-4 gap-y-3 p-5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        lead && "gap-x-6 p-6 ring-1 ring-status-warning/25",
      )}
    >
      <TraderAvatar wallet={t.wallet} name={t.name} size={lead ? 72 : 48} className="shrink-0" />
      <div className="min-w-0 flex-1 basis-32">
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em]", PLACE[place])}>
          <Medal className="size-3.5" aria-hidden="true" /> {PLACE_NAME[place]}
        </span>
        <span className={cn("mt-1 block truncate font-semibold group-hover:text-primary", lead ? "text-lg" : "text-base")}>{t.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t.positions > 0 ? (
            <>
              {t.positions} open {t.positions === 1 ? "bet" : "bets"}
              {t.openRoi !== null && (
                <>
                  {" · "}
                  <span className={cn("tabular whitespace-nowrap font-medium", t.openRoi >= 0 ? "text-status-good" : "text-chart-2")} title="Return on open bets">
                    {t.openRoi >= 0 ? "▲ +" : "▼ "}
                    {pct(Math.abs(t.openRoi), Math.abs(t.openRoi) < 0.1 ? 1 : 0)}
                  </span>
                </>
              )}
            </>
          ) : (
            "No open bets right now"
          )}
        </span>
      </div>
      <div className="ml-auto shrink-0 text-right">
        <span className={cn("tabular block font-semibold tracking-tight", lead ? "text-3xl sm:text-4xl" : "text-2xl")}>${compact(t.pnl)}</span>
        <span className="text-xs text-muted-foreground">total profit</span>
      </div>
    </Link>
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

      <Section title="Ranks 4 to 12" description="Total profit on Polymarket, next to the leader's">
        <TraderProfitList traders={ranked.slice(3, 12)} max={ranked[0]?.pnl} />
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
