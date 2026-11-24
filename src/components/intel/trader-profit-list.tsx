import Link from "next/link";
import type { WalletStat } from "@/lib/whales";
import { CountUp } from "@/components/motion/count-up";
import { walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";

export type ProfitListTrader = Pick<WalletStat, "wallet" | "name" | "rank" | "pnl">;

/** What a live page adds (see live-board.tsx). Server pages leave it out. */
export interface LiveMarks {
  /** Places gained (positive) or lost since the page's first live read, by lowercase wallet. */
  moved?: Map<string, number>;
  /** The latest update was the first live read: figures change silently instead of all sheening at once. */
  quiet?: boolean;
}

/** "▲2" when a trader gained places since the page's first live read, "▼1" when they lost them. */
export function RankMove({ places }: { places: number | undefined }) {
  if (!places) return null;
  const up = places > 0;
  const n = Math.abs(places);
  const words = `${up ? "Up" : "Down"} ${n} ${n === 1 ? "place" : "places"} since you opened this page`;
  return (
    <span title={words} className={cn("tabular shrink-0 text-[10px] font-medium", up ? "text-status-good" : "text-chart-2")}>
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {n}
      </span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/**
 * Top traders as horizontal profit bars, longest first, each linking to its
 * wallet page. Profit is a CountUp without the intro, so on a live page a
 * changed figure sheens once and counts to its new value.
 *
 * Pass `max` when the list is a slice that excludes the leader (say ranks 4
 * to 12): scaling to the slice's own top would make every bar nearly full and
 * show nothing. Scaling to the overall leader shows the real drop-off.
 */
export function TraderProfitList({ traders, max: scaleMax, className, live }: { traders: ProfitListTrader[]; max?: number; className?: string; live?: LiveMarks }) {
  const max = Math.max(scaleMax ?? 0, ...traders.map((t) => t.pnl), 1);
  return (
    <ol className={cn("space-y-2.5", className)}>
      {traders.map((t) => (
        <li key={t.wallet}>
          <Link href={walletHref(t.wallet)} className="group grid grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="tabular font-mono text-xs text-muted-foreground">{t.rank}</span>
            <TraderAvatar wallet={t.wallet} name={t.name} size={26} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium group-hover:text-primary">{t.name}</span>
                <RankMove places={live?.moved?.get(t.wallet.toLowerCase())} />
              </span>
              <span className="mt-1 block h-1.5 rounded-full bg-surface-3" aria-hidden="true">
                <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, (t.pnl / max) * 100)}%` }} />
              </span>
            </span>
            <CountUp value={t.pnl} format="usd" intro={false} animate={!live?.quiet} className="tabular text-right text-sm font-semibold" />
          </Link>
        </li>
      ))}
    </ol>
  );
}
