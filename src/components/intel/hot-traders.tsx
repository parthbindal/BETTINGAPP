import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { LeaderEntry } from "@/lib/data/providers/polymarket-whales";
import { compact } from "@/lib/format";
import { walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";

export type HotPeriod = "day" | "week" | "month";
export const HOT_PERIODS: Array<{ key: HotPeriod; label: string; api: "DAY" | "WEEK" | "MONTH" }> = [
  { key: "day", label: "Today", api: "DAY" },
  { key: "week", label: "This week", api: "WEEK" },
  { key: "month", label: "This month", api: "MONTH" },
];

const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${compact(Math.abs(n))}`;

/**
 * Who is winning right now, from Polymarket's short-window boards, with one
 * question answered per row: is this a proven trader (also in the all-time top
 * 1,000 EDGEWISE tracks) or a hot streak? Hot boards on their own reward lucky
 * one-off wins; the badge is what makes them useful.
 */
export function HotTradersBoard({
  traders,
  period,
  allTimeRank,
  hrefFor,
}: {
  traders: LeaderEntry[];
  period: HotPeriod;
  allTimeRank: Map<string, number>;
  hrefFor: (p: HotPeriod) => string;
}) {
  const max = Math.max(...traders.map((t) => Math.abs(t.pnl)), 1);
  return (
    <div>
      <nav className="mb-4 inline-flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Hot traders window">
        {HOT_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={hrefFor(p.key)}
            scroll={false}
            aria-current={p.key === period ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", p.key === period && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]")}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      {traders.length ? (
        <ol className="space-y-2.5">
          {traders.slice(0, 9).map((t, i) => {
            const rank = allTimeRank.get(t.wallet.toLowerCase());
            return (
              <li key={t.wallet}>
                <Link href={walletHref(t.wallet)} className="group grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2.5">
                  <span className="tabular font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <TraderAvatar wallet={t.wallet} name={t.name} size={26} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium group-hover:text-primary">{t.name}</span>
                      {rank ? (
                        <span title={`Also #${rank} on Polymarket's all-time profit board`} className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-brand-cyan/35 bg-brand-cyan/10 px-1.5 py-px text-[10px] font-medium text-brand-cyan">
                          <ShieldCheck className="size-3" aria-hidden="true" /> #{rank} all-time
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block h-1 rounded-full bg-surface-3" aria-hidden="true">
                      <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${Math.max(3, (Math.abs(t.pnl) / max) * 100)}%` }} />
                    </span>
                  </span>
                  {/* Signed, not colored: a good week is not a settled result. */}
                  <span className="tabular text-right text-sm font-semibold">{signed(t.pnl)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Polymarket did not return this board just now. Try again in a minute.</p>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-cyan" aria-hidden="true" />
        <span>
          <span className="text-foreground/85">All-time badge</span> = also among the 1,000 most profitable traders ever. Without it, a big week can be one lucky bet.
        </span>
      </p>
    </div>
  );
}
