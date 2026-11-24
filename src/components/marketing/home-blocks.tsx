import { BellRing, ChevronDown, Lock } from "lucide-react";
import type { PublicMove } from "@/lib/data/public-cache";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { cents, compact, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A window around a slice of the real app, so the homepage shows the product
 * instead of describing it. The status on the right says what the data is and
 * how old; `live` gives it the page's one pulse dot.
 */
export function ProductFrame({ address, status, live = true, className, children }: { address: string; status: string; live?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-surface-1/95 shadow-[0_48px_120px_-48px_color-mix(in_oklch,var(--primary)_55%,transparent)]", className)}>
      <div className="flex items-center gap-3 border-b border-border bg-card/60 px-4 py-2.5">
        <span className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="mx-auto hidden min-w-0 max-w-xs flex-1 items-center justify-center gap-1.5 rounded-md bg-surface-2/80 px-3 py-1 text-[11px] text-muted-foreground sm:flex">
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{address}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:ml-0">
          {live ? <span className="pulse-live" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-status-warning" aria-hidden="true" />}
          {status}
        </span>
      </div>
      {children}
    </div>
  );
}

/** One big move by a top trader, read as a sentence: who, bought or sold what, at what price, for how much. */
export function BigMoveRow({ m }: { m: PublicMove }) {
  const bought = m.side === "BUY";
  return (
    <li className="card-surface flex items-start gap-3 p-4">
      <TraderAvatar wallet={m.wallet} name={m.traderName} size={30} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* The name gives way before the verb does: "0x2c33…0563 bought", never "0x2c33…0563 bo…". */}
          <span className="flex min-w-0 items-baseline gap-1 text-sm">
            <span className="truncate font-medium">{m.traderName}</span>
            <span className={cn("shrink-0", bought ? "text-foreground/80" : "text-muted-foreground")}>{bought ? "bought" : "sold"}</span>
          </span>
          <span className="figure shrink-0 text-sm font-semibold">${compact(Math.round(m.usd))}</span>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {/* SidePill's look, but truncating: team names in spread markets run long. */}
          <span className="min-w-0 truncate rounded-md bg-surface-3 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-foreground ring-1 ring-inset ring-border" title={m.outcome}>
            {m.outcome}
          </span>
          <span className="tabular shrink-0 whitespace-nowrap">at {cents(m.avgPrice)}</span>
        </div>
        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{m.title}</div>
        <div className="tabular mt-0.5 text-[11px] text-muted-foreground/80">
          #{m.rank} all-time · {relative(m.lastTradeAt)}
        </div>
      </div>
    </li>
  );
}

/** A big move as the alert a Pro member receives. */
export function AlertCard({ m, className }: { m: PublicMove; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-border bg-card/95 p-3.5 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.8)]", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-foreground" aria-hidden="true">
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>Whale alert</span>
          <span className="tabular">{relative(m.lastTradeAt)}</span>
        </div>
        <p className="mt-0.5 text-sm leading-snug">
          <span className="font-semibold">{m.traderName}</span> <span className="text-muted-foreground">(#{m.rank})</span> {m.side === "BUY" ? "bought" : "sold"}{" "}
          <span className="figure font-semibold">${compact(Math.round(m.usd))}</span> of {m.outcome} at {cents(m.avgPrice)}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.title}</p>
      </div>
    </div>
  );
}

/** A question that opens in place; no script needed. */
export function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border py-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {q}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
