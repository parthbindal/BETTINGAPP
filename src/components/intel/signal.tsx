import type React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Clock3, Crown, Flame, Users } from "lucide-react";
import type { ConsensusHolding } from "@/lib/whales";
import { readConsensus } from "@/lib/intel";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";

/**
 * Consumer vocabulary for a consensus outcome ("signal"). Every visual here
 * pairs color with an icon and words, and every figure is a measured one from
 * the Polymarket scan.
 */

type SignalKind = "now" | "held" | "whale" | "broad";

const KIND: Record<SignalKind, { label: string; icon: typeof Flame; cls: string }> = {
  now: { label: "Piling in now", icon: Flame, cls: "border-primary/40 bg-primary/12 text-primary" },
  held: { label: "Held for weeks", icon: Clock3, cls: "border-border bg-surface-2 text-foreground/85" },
  whale: { label: "One big whale", icon: Crown, cls: "border-status-warning/40 bg-status-warning/10 text-status-warning" },
  broad: { label: "Wide agreement", icon: Users, cls: "border-brand-cyan/35 bg-brand-cyan/10 text-brand-cyan" },
};

export const SIGNAL_KINDS = (Object.keys(KIND) as SignalKind[]).map((k) => ({ key: k, ...KIND[k] }));
export type { SignalKind };

export function signalKind(h: ConsensusHolding): SignalKind {
  const r = readConsensus(h).label;
  return r === "Converging now" ? "now" : r === "Long-held" ? "held" : r === "Whale-led" ? "whale" : "broad";
}

export function SignalBadge({ h, className }: { h: ConsensusHolding; className?: string }) {
  const k = KIND[signalKind(h)];
  const Icon = k.icon;
  return (
    <span title={readConsensus(h).detail} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", k.cls, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {k.label}
    </span>
  );
}

/** The side the traders are on, as a solid pill. Yes/No get distinct shapes of emphasis, not just color. */
export function SidePill({ outcome, size = "md" }: { outcome: string; size?: "md" | "lg" }) {
  const o = outcome.trim();
  const tone = /^yes$/i.test(o) ? "bg-status-good/15 text-status-good ring-status-good/40" : /^no$/i.test(o) ? "bg-chart-2/15 text-chart-2 ring-chart-2/40" : "bg-primary/15 text-primary ring-primary/40";
  return (
    <span className={cn("inline-flex max-w-[12rem] items-center truncate rounded-md font-semibold uppercase tracking-wide ring-1 ring-inset", size === "lg" ? "px-2.5 py-1 text-base" : "px-1.5 py-0.5 text-xs", tone)}>
      {o || "—"}
    </span>
  );
}

/** Overlapping avatars of the biggest holders, then "+N". */
export function AvatarStack({ holders, total, max = 5, size = 24 }: { holders: Array<{ wallet: string; name: string }>; total: number; max?: number; size?: number }) {
  const shown = holders.slice(0, max);
  const extra = Math.max(0, total - shown.length);
  return (
    <span className="flex items-center">
      {shown.map((t, i) => (
        <TraderAvatar key={t.wallet} wallet={t.wallet} name={t.name} size={size} className={cn("ring-2 ring-card", i > 0 && "-ml-2")} />
      ))}
      {extra > 0 && (
        <span className="-ml-2 inline-flex items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-semibold text-muted-foreground ring-2 ring-card" style={{ height: size, minWidth: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * What they paid versus the price now, on a 0–100¢ track. The filled segment
 * spans entry → now; up moves use the "good" token with an up arrow, down
 * moves the orange series with a down arrow.
 */
export function PriceTrack({ entry, now, className }: { entry: number; now: number; className?: string }) {
  const e = Math.min(1, Math.max(0, entry));
  const n = Math.min(1, Math.max(0, now));
  const up = n >= e;
  const change = e > 0 ? (n - e) / e : 0;
  const lo = Math.min(e, n);
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">
          Paid <span className="tabular font-medium text-foreground">{Math.round(e * 100)}¢</span> → now <span className="tabular font-medium text-foreground">{Math.round(n * 100)}¢</span>
        </span>
        <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", up ? "text-status-good" : "text-chart-2")}>
          <Arrow className="size-3.5" aria-hidden="true" />
          {up ? "+" : ""}
          {Math.round(change * 100)}%
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden="true">
        <span className={cn("absolute inset-y-0 rounded-full", up ? "bg-status-good/70" : "bg-chart-2/70")} style={{ left: `${lo * 100}%`, width: `${Math.max(Math.abs(n - e) * 100, 0.8)}%` }} />
        <span className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground" style={{ left: `${e * 100}%` }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card" style={{ left: `${n * 100}%` }} />
      </div>
    </div>
  );
}

const fmtEnd = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);

/**
 * One signal: N of the top traders hold the same side of a market. Reads
 * top to bottom as a sentence: what the market is, who agrees and on which
 * side, how the trade has gone, and how much money is behind it.
 */
export function SignalCard({ h, rank, href, featured = false, className, id, footer }: { h: ConsensusHolding; rank?: number; href?: string; featured?: boolean; className?: string; id?: string; footer?: React.ReactNode }) {
  const end = fmtEnd(h.endDate);
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {rank !== undefined && <span className="tabular font-mono text-muted-foreground/80">#{rank}</span>}
          <span className="truncate">{h.category}{end ? ` · ends ${end}` : ""}</span>
        </span>
        <SignalBadge h={h} />
      </div>

      <h3 className={cn("mt-2.5 line-clamp-2 font-medium leading-snug group-hover:text-primary", featured ? "text-xl sm:text-2xl" : "text-[15px]")}>{h.title}</h3>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("tabular font-semibold tracking-tight", featured ? "text-5xl" : "text-3xl")}>{h.holders}</span>
          <span className="text-sm text-muted-foreground">top traders bet</span>
        </span>
        <SidePill outcome={h.outcome} size={featured ? "lg" : "md"} />
      </div>

      {h.topHolders?.length ? (
        <div className="mt-3">
          <AvatarStack holders={h.topHolders} total={h.holders} size={featured ? 28 : 22} />
        </div>
      ) : null}

      <PriceTrack className="mt-4" entry={h.avgEntry} now={h.currentPrice} />

      {featured && h.topHolders?.length ? (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Biggest traders in this bet</div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {h.topHolders.slice(0, 3).map((t) => (
              <li key={t.wallet} className="flex min-w-0 items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2">
                <TraderAvatar wallet={t.wallet} name={t.name} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{t.name}</span>
                  <span className="tabular block text-[11px] text-muted-foreground">
                    #{t.rank} · ${compact(t.value)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="min-h-4 flex-1" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs">
        <span>
          <span className="tabular text-sm font-semibold">${compact(h.totalValue)}</span> <span className="text-muted-foreground">on the line</span>
        </span>
        {href && <span className="font-medium text-primary">Details →</span>}
      </div>
      {footer}
    </>
  );
  const cls = cn("card-surface group flex flex-col p-4 transition-colors", featured && "p-6", href && "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className);
  return href ? (
    <Link id={id} href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div id={id} className={cls}>
      {inner}
    </div>
  );
}
