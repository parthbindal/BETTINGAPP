import Link from "next/link";
import { compact } from "@/lib/format";
import { walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";

/**
 * Category slots in palette order, skipping the two reserved for meaning
 * (chart-2 = price down, chart-6 = price up). Holders are identities, not moods.
 */
const SLOTS = ["bg-chart-1", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-7", "bg-chart-8"] as const;

export interface Holder {
  wallet: string;
  name: string;
  rank: number;
  value: number;
}

const pctOf = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
const fmtPct = (p: number) => (p >= 10 ? `${Math.round(p)}%` : p >= 1 ? `${p.toFixed(1)}%` : "<1%");

/**
 * Who owns this side of the market: each of the biggest holders' share of the
 * dollars, as one bar, with everyone else pooled in grey. Concentration is the
 * thing a holder count hides: 30 traders where one holds 70% is not 30 votes.
 */
export function OwnershipBar({ holders, total, holderCount }: { holders: Holder[]; total: number; holderCount: number }) {
  const top = [...holders].sort((a, b) => b.value - a.value).slice(0, SLOTS.length);
  const topSum = top.reduce((s, h) => s + h.value, 0);
  const rest = Math.max(0, total - topSum);
  const restCount = Math.max(0, holderCount - top.length);
  return (
    <div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={top.map((h) => `${h.name} ${fmtPct(pctOf(h.value, total))}`).join(", ") + (rest > 0 ? `, everyone else ${fmtPct(pctOf(rest, total))}` : "")}>
        {top.map((h, i) => (
          <span key={h.wallet} className={cn(SLOTS[i])} style={{ width: `${pctOf(h.value, total)}%` }} title={`${h.name}: $${compact(h.value)}`} />
        ))}
        {rest > 0 && <span className="bg-muted-foreground/35" style={{ width: `${pctOf(rest, total)}%` }} title={`Everyone else: $${compact(rest)}`} />}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {top.map((h, i) => (
          <li key={h.wallet}>
            <Link href={walletHref(h.wallet)} className="group flex items-center gap-2.5">
              <span className={cn("size-2.5 shrink-0 rounded-sm", SLOTS[i])} aria-hidden="true" />
              <TraderAvatar wallet={h.wallet} name={h.name} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm group-hover:text-primary">{h.name}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">#{h.rank}</span>
              <span className="tabular w-14 shrink-0 text-right text-sm font-semibold">{fmtPct(pctOf(h.value, total))}</span>
            </Link>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-center gap-2.5 sm:col-span-2">
            <span className="size-2.5 shrink-0 rounded-sm bg-muted-foreground/35" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Everyone else{restCount ? ` (${restCount} more trader${restCount === 1 ? "" : "s"})` : ""}</span>
            <span className="tabular w-14 shrink-0 text-right text-sm font-semibold">{fmtPct(pctOf(rest, total))}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
