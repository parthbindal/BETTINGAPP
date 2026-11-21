import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { RecentMove, WalletStat } from "@/lib/whales";
import { compact, relative } from "@/lib/format";
import { polygonTxUrl, polymarketEventUrl, walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";
import { SidePill } from "./signal";

/** One trade, read as a sentence: "<trader> bought <side> at 82¢ — $4.2K". */
export function TradeRow({ m, fresh = false, showTx = false }: { m: RecentMove; fresh?: boolean; showTx?: boolean }) {
  const buy = m.side === "BUY";
  const Icon = buy ? ArrowUpRight : ArrowDownLeft;
  const who = m.wallet ? (
    <Link href={walletHref(m.wallet)} className="font-medium hover:text-primary">
      {m.trader}
    </Link>
  ) : (
    <span className="font-medium">{m.trader}</span>
  );
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="relative">
        <TraderAvatar wallet={m.wallet ?? m.trader} name={m.trader} size={34} />
        <span
          className={cn("absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full ring-2 ring-card", buy ? "bg-status-good text-background" : "bg-chart-2 text-background")}
          aria-hidden="true"
        >
          <Icon className="size-3" strokeWidth={2.5} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 break-words text-sm leading-relaxed">
            {who} <span className="text-muted-foreground">{buy ? "bought" : "sold"}</span> <SidePill outcome={m.outcome} />{" "}
            <span className="tabular text-muted-foreground">at {m.pricePct}¢</span>
          </p>
          <span className="tabular shrink-0 text-sm font-semibold">${compact(m.usd)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {m.eventSlug ? (
            <a href={polymarketEventUrl(m.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-foreground">
              {m.title}
            </a>
          ) : (
            m.title
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          {fresh && <span className="inline-flex items-center gap-1 font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />New</span>}
          <span>Rank #{m.rank}</span>
          <span aria-hidden="true">·</span>
          <span>{relative(m.tsIso)}</span>
          {showTx && m.txHash && (
            <>
              <span aria-hidden="true">·</span>
              <a href={polygonTxUrl(m.txHash)} target="_blank" rel="noreferrer" className="hover:text-foreground">
                Verify on-chain ↗
              </a>
            </>
          )}
          <span className="sr-only">{buy ? "Buy" : "Sell"}</span>
        </p>
      </div>
    </div>
  );
}

/** Top traders as horizontal profit bars, longest first, each linking to its wallet page. */
export function TraderProfitList({ traders, className }: { traders: WalletStat[]; className?: string }) {
  const max = Math.max(...traders.map((t) => t.pnl), 1);
  return (
    <ol className={cn("space-y-2.5", className)}>
      {traders.map((t) => (
        <li key={t.wallet}>
          <Link href={walletHref(t.wallet)} className="group grid grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="tabular font-mono text-xs text-muted-foreground">{t.rank}</span>
            <TraderAvatar wallet={t.wallet} name={t.name} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium group-hover:text-primary">{t.name}</span>
              <span className="mt-1 block h-1.5 rounded-full bg-surface-3" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary/80" style={{ width: `${Math.max(2, (t.pnl / max) * 100)}%` }} />
              </span>
            </span>
            <span className="tabular text-right text-sm font-semibold">${compact(t.pnl)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
