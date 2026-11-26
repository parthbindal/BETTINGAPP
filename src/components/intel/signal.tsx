import type React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Clock3, Scale, UserRound, Users } from "lucide-react";
import type { ConsensusHolding } from "@/lib/whales";
import { explainSplit, isInPlay, readConsensus } from "@/lib/intel";
import { OpenOnPolymarket } from "./open-on-polymarket";
import { CountUp } from "@/components/motion/count-up";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "./trader-identity";

/**
 * Consumer vocabulary for a consensus outcome ("signal"). Every visual here
 * pairs color with an icon and words, and every figure is a measured one from
 * the Polymarket scan.
 */

type SignalKind = "now" | "held" | "whale" | "broad";

const KIND: Record<SignalKind, { label: string; meaning: string; icon: typeof Clock3; cls: string }> = {
  now: { label: "New money this week", meaning: "Many of these traders bought in the last 7 days.", icon: CalendarClock, cls: "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan" },
  held: { label: "Long-term bet", meaning: "They have held this side for a month or more.", icon: Clock3, cls: "border-border bg-surface-2 text-foreground/85" },
  whale: { label: "Mostly one trader", meaning: "One trader holds over half the money, so agreement is thinner than it looks.", icon: UserRound, cls: "border-status-warning/40 bg-status-warning/10 text-status-warning" },
  broad: { label: "Many traders agree", meaning: "The money is spread across many traders, not one big one.", icon: Users, cls: "border-brand-cyan/35 bg-brand-cyan/10 text-brand-cyan" },
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
    <span title={readConsensus(h).detail} className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", k.cls, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {k.label}
    </span>
  );
}

/** The side the traders are on, as a solid pill. Yes/No get distinct shapes of emphasis, not just color. */
export function SidePill({ outcome, size = "md" }: { outcome: string; size?: "md" | "lg" }) {
  const o = outcome.trim();
  // Sides are words, not moods: a neutral pill, so YES/NO never borrow the up/down colors.
  const tone = "bg-surface-3 text-foreground ring-border";
  return (
    <span className={cn("inline-flex max-w-[12rem] items-center truncate rounded-md font-semibold uppercase tracking-wide ring-1 ring-inset", size === "lg" ? "px-2.5 py-1 text-base" : "px-1.5 py-0.5 text-xs", tone)}>
      {o || "—"}
    </span>
  );
}

/** Overlapping avatars of the biggest holders, then "+N". */
/** CSS custom property for .stagger-in children. */
export const staggerIndex = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function AvatarStack({ holders, total, max = 5, size = 24, stagger = false }: { holders: Array<{ wallet: string; name: string }>; total: number; max?: number; size?: number; stagger?: boolean }) {
  const shown = holders.slice(0, max);
  const extra = Math.max(0, total - shown.length);
  return (
    <span className={cn("flex items-center", stagger && "stagger-in")}>
      {shown.map((t, i) => (
        <span key={t.wallet} className={cn("inline-flex", i > 0 && "-ml-2")} style={staggerIndex(i)}>
          <TraderAvatar wallet={t.wallet} name={t.name} size={size} className="ring-2 ring-card" />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 inline-flex items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-semibold text-muted-foreground ring-2 ring-card" style={{ height: size, minWidth: size, ...staggerIndex(shown.length) }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * What they paid versus the price now, on a 0–100¢ track. The filled segment
 * spans entry → now. Direction is carried by the arrow and the sign, never by
 * color: green and red mean won and lost, and an open position has done
 * neither yet. A green +70% on a bet that has not settled reads as a win
 * before there is a result, which is the exact claim the track record refuses
 * to make.
 */
export function PriceTrack({ entry, now, className }: { entry: number; now: number; className?: string }) {
  const e = Math.min(1, Math.max(0, entry));
  const n = Math.min(1, Math.max(0, now));
  const up = n >= e;
  const change = e > 0 ? (n - e) / e : 0;
  const flat = Math.abs(change) < 0.005; // under half a percent reads as "no change", in neutral
  const lo = Math.min(e, n);
  const Arrow = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">
          Paid <span className="tabular font-medium text-foreground">{Math.round(e * 100)}¢</span> → now <span className="tabular font-medium text-foreground">{Math.round(n * 100)}¢</span>
        </span>
        <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", flat ? "text-muted-foreground" : "text-foreground")}>
          <Arrow className="size-3.5" aria-hidden="true" />
          {flat ? "0" : `${up ? "+" : "−"}${Math.abs(Math.round(change * 100))}`}%
          <span className="sr-only"> since they bought</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden="true">
        <span className={cn("absolute inset-y-0 rounded-full", flat ? "bg-muted-foreground/50" : "bg-foreground/45")} style={{ left: `${lo * 100}%`, width: `${Math.max(Math.abs(n - e) * 100, 0.8)}%` }} />
        <span className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground" style={{ left: `${e * 100}%` }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card" style={{ left: `${n * 100}%` }} />
      </div>
    </div>
  );
}

const SPLIT_COLORS = ["bg-foreground/80", "bg-muted-foreground/60"] as const; // neutral: sides are identity, not meaning

/**
 * A market where top traders sit on BOTH sides. Shown as one card so the
 * disagreement is visible, instead of two cards that each look like consensus.
 */
export function SplitCard({ sides, rank, id, href, className }: { sides: ConsensusHolding[]; rank?: number; id?: string; href?: string; className?: string }) {
  const [a, b] = sides as [ConsensusHolding, ConsensusHolding];
  const totalHolders = sides.reduce((s, h) => s + h.holders, 0);
  const end = fmtEnd(a.endDate);
  return (
    <div id={id} className={cn("card-surface lift relative flex flex-col p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {rank !== undefined && <span className="tabular font-mono text-muted-foreground/80">#{rank}</span>}
          <span className="truncate">
            {a.category}
            {end ? ` · ends ${end}` : ""}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-status-warning/40 bg-status-warning/10 px-2 py-0.5 text-[11px] font-medium text-status-warning">
          <Scale className="size-3" aria-hidden="true" /> Top traders are split
        </span>
      </div>

      <h3 className="mt-2.5 line-clamp-2 text-[15px] font-medium leading-snug">
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-primary focus-visible:outline-none">
            {a.title}
          </Link>
        ) : (
          a.title
        )}
      </h3>
      <p className="mt-2 text-xs text-muted-foreground">{explainSplit(a, b)}</p>

      {/* Share of the top traders on each side */}
      <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={sides.map((s) => `${s.holders} top traders on ${s.outcome}`).join(", ")}>
        {sides.map((s, i) => (
          <span key={s.tokenId} className={cn(SPLIT_COLORS[i % 2])} style={{ width: `${(s.holders / totalHolders) * 100}%` }} />
        ))}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3">
        {sides.slice(0, 2).map((s, i) => (
          <li key={s.tokenId} className={cn("min-w-0", i === 1 && "text-right")}>
            <span className={cn("flex items-center gap-1.5", i === 1 && "justify-end")}>
              <span className={cn("size-2.5 shrink-0 rounded-sm", SPLIT_COLORS[i % 2])} aria-hidden="true" />
              <SidePill outcome={s.outcome} />
            </span>
            <span className="mt-1.5 block">
              <span className="figure text-2xl font-semibold">{s.holders}</span> <span className="text-xs text-muted-foreground">traders</span>
            </span>
            <span className="tabular block text-xs text-muted-foreground">
              ${compact(s.totalValue)} invested · now {Math.round(s.currentPrice * 100)}¢
            </span>
          </li>
        ))}
      </ul>

      {/*
        Who leads each side. A split card shares a grid row with full signal cards, which are taller;
        this is the space that used to sit empty, and "who is on the other side" is what a split is about.
      */}
      <ul className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
        {sides.slice(0, 2).map((s, i) => {
          const top = s.topHolders?.[0];
          return (
            <li key={s.tokenId} className={cn("min-w-0", i === 1 && "text-right")}>
              <div className="label-micro">Biggest on {s.outcome.length > 12 ? "this side" : s.outcome}</div>
              {top ? (
                <div className={cn("mt-1.5 flex min-w-0 items-center gap-2", i === 1 && "flex-row-reverse")}>
                  <TraderAvatar wallet={top.wallet} name={top.name} size={22} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{top.name}</span>
                    <span className="tabular block text-[11px] text-muted-foreground">
                      #{top.rank} · ${compact(top.value)}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="mt-1.5 text-xs text-muted-foreground">Not in this scan</div>
              )}
              <div className="tabular mt-2 text-[11px] text-muted-foreground">Paid {Math.round(s.avgEntry * 100)}¢ on average</div>
            </li>
          );
        })}
      </ul>
      {/* One link to the market, never a button per side: the sentence above says which side leads. */}
      <div className="min-h-3 flex-1" aria-hidden="true" />
      <OpenOnPolymarket className="relative z-10 mt-3 self-start" variant="ghost" market title={a.title} outcome={a.outcome} eventSlug={a.slug} marketSlug={a.marketSlug} inPlay={isInPlay(a)} />
    </div>
  );
}

/** $1M+ big, $100K–$1M mid, under $100K small. */
export type MoneyTier = "big" | "mid" | "small";
export const moneyTier = (usd: number): MoneyTier => (usd >= 1_000_000 ? "big" : usd >= 100_000 ? "mid" : "small");
// The page's three type sizes: hero figure, card figure, body.
const TIER_MONEY: Record<MoneyTier, string> = { big: "text-3xl", mid: "text-2xl", small: "text-sm" };

export const fmtEnd = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);

/**
 * One signal: N of the top traders hold the same side of a market. Reads
 * top to bottom as a sentence: what the market is, who agrees and on which
 * side, how the trade has gone, and how much money is behind it.
 */
export function SignalCard({ h, rank, href, featured = false, tiered = false, primaryCta = false, className, id, footer }: { h: ConsensusHolding; rank?: number; href?: string; featured?: boolean; tiered?: boolean; /** The page's one solid CTA. */ primaryCta?: boolean; className?: string; id?: string; footer?: React.ReactNode }) {
  const end = fmtEnd(h.endDate);
  // Size on screen tracks size in dollars, in three steps (never a continuous ramp).
  const tier = tiered ? moneyTier(h.totalValue) : "mid";
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {rank !== undefined && <span className="tabular font-mono text-muted-foreground/80">#{rank}</span>}
          <span className="truncate">{h.category}{end ? ` · ends ${end}` : ""}</span>
        </span>
        <SignalBadge h={h} />
      </div>

      <h3 className={cn("mt-2.5 line-clamp-2 font-medium leading-snug", featured ? "text-xl sm:text-2xl" : "text-[15px]")}>
        {href ? (
          // Stretched link: the whole card opens the signal; the Polymarket button sits above it.
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {h.title}
          </Link>
        ) : (
          h.title
        )}
      </h3>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("figure font-semibold", featured ? "text-4xl" : "text-2xl")}>{h.holders}</span>
          <span className="text-sm text-muted-foreground">top traders bet</span>
        </span>
        <SidePill outcome={h.outcome} size={featured ? "lg" : "md"} />
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{readConsensus(h).detail}</p>

      {h.topHolders?.length ? (
        <div className="mt-3">
          <AvatarStack holders={h.topHolders} total={h.holders} size={featured ? 28 : 22} />
        </div>
      ) : null}

      <PriceTrack className="mt-4" entry={h.avgEntry} now={h.currentPrice} />

      {featured && h.topHolders?.length ? (
        <div className="mt-5">
          <div className="label-micro mb-2">Biggest traders in this bet</div>
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
        <span className={cn(tier !== "small" && "flex flex-col")}>
          <span className={cn("figure font-semibold", TIER_MONEY[tier])}>${compact(h.totalValue)}</span>{" "}
          <span className="text-muted-foreground">invested</span>
        </span>
        {href && <span className="text-muted-foreground">See details →</span>}
      </div>
      <OpenOnPolymarket className={cn("relative z-10 mt-3", !(featured || primaryCta) && "self-start")} variant={featured || primaryCta ? "full" : "ghost"} title={h.title} outcome={h.outcome} eventSlug={h.slug} marketSlug={h.marketSlug} inPlay={isInPlay(h)} />
      {footer && <div className="relative z-10">{footer}</div>}
    </>
  );
  return (
    <div id={id} className={cn("card-surface lift group relative flex flex-col p-4", featured && "p-6", tier === "big" && "ring-1 ring-foreground/15", href && "hover:border-primary/40", className)}>
      {inner}
    </div>
  );
}

/**
 * The one signal that opens Home: full width, the headline count and the money
 * counting up once, the avatars arriving one by one. Everything else on the
 * page enters after it. `action` replaces the Polymarket button (the homepage
 * sends visitors to sign up instead).
 */
export function HeroSignal({ h, href, action }: { h: ConsensusHolding; href: string; action?: React.ReactNode }) {
  const end = fmtEnd(h.endDate);
  return (
    <article className="card-surface relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {h.category}
          {end ? ` · ends ${end}` : ""}
        </span>
        <SignalBadge h={h} />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none">
              {h.title}
            </Link>
          </h2>
          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="flex items-baseline gap-2">
              <CountUp value={h.holders} id={`hero-holders-${h.tokenId}`} className="figure text-5xl font-semibold leading-none sm:text-6xl" />
              <span className="text-base text-muted-foreground">top traders bet</span>
            </span>
            <SidePill outcome={h.outcome} size="lg" />
          </div>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">{readConsensus(h).detail}</p>
          {h.topHolders?.length ? (
            <div className="mt-5">
              <AvatarStack holders={h.topHolders} total={h.holders} size={28} max={7} stagger />
            </div>
          ) : null}
        </div>

        <div className="relative z-10 flex min-w-0 flex-col gap-4">
          <PriceTrack entry={h.avgEntry} now={h.currentPrice} />
          <div>
            <div className="label-micro">Invested on this side</div>
            <CountUp value={h.totalValue} format="usd" id={`hero-value-${h.tokenId}`} className="figure mt-1 block text-3xl font-semibold" />
          </div>
          {h.topHolders?.length ? (
            <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
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
          ) : null}
          {action ?? <OpenOnPolymarket title={h.title} outcome={h.outcome} eventSlug={h.slug} marketSlug={h.marketSlug} inPlay={isInPlay(h)} />}
        </div>
      </div>
    </article>
  );
}
