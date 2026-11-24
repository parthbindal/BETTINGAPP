import Link from "next/link";
import { Medal } from "lucide-react";
import { pct } from "@/lib/format";
import { CountUp } from "@/components/motion/count-up";
import { walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";
import { RankMove, type LiveMarks } from "./trader-profit-list";

export interface PodiumTrader {
  wallet: string;
  name: string;
  pnl: number;
  positions: number;
  openRoi: number | null;
  /** New to the top since the last scan, so its open bets have not been read yet. */
  unscanned?: boolean;
}

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
export function Podium({ top, live }: { top: PodiumTrader[]; live?: LiveMarks }) {
  const [first, ...rest] = top;
  if (!first) return null;
  return (
    <div className="space-y-4">
      <PodiumCard t={first} place={0} lead live={live} />
      {rest.length > 0 && (
        <ol className="grid gap-4 sm:grid-cols-2">
          {rest.map((t, i) => (
            <li key={t.wallet}>
              <PodiumCard t={t} place={i + 1} live={live} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PodiumCard({ t, place, lead = false, live }: { t: PodiumTrader; place: number; lead?: boolean; live?: LiveMarks }) {
  const w = t.wallet.toLowerCase();
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
          <RankMove places={live?.moved?.get(w)} />
        </span>
        <span className={cn("mt-1 block truncate font-semibold group-hover:text-primary", lead ? "text-lg" : "text-base")}>{t.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t.unscanned ? (
            "New to the top; open bets appear after the next scan"
          ) : t.positions > 0 ? (
            <>
              {t.positions} open {t.positions === 1 ? "bet" : "bets"}
              {t.openRoi !== null && (
                <>
                  {" · "}
                  <span className={cn("tabular whitespace-nowrap font-medium", t.openRoi >= 0 ? "text-status-good" : "text-chart-2")} title="Return on open bets, as on the trader's Polymarket profile">
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
        <CountUp value={t.pnl} format="usd" intro={false} animate={!live?.quiet} className={cn("figure block font-semibold", lead ? "text-4xl sm:text-5xl" : "text-2xl")} />
        <span className="label-micro">all-time profit</span>
      </div>
    </Link>
  );
}
