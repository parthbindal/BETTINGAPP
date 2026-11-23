import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ConsensusHolding } from "@/lib/whales";
import { compact } from "@/lib/format";
import { moneyByMove, moveDirection, moveTier, sinceEntry } from "@/lib/intel";
import { legibleTreemap, takeLargest, type Rect } from "@/lib/treemap";
import { cn } from "@/lib/utils";
import { AvatarStack, SidePill, SignalBadge, fmtEnd } from "./signal";
import { TraderAvatar } from "./trader-identity";

/*
 * The smart-money map. Every tile is a real link to its signal, sized by the
 * dollars the top traders have on it and tinted by how the price has moved
 * since they bought. It speaks the same visual language as the rest of the
 * app (see .map-tint in globals.css): dark tiles, a faint wash of the meaning
 * colour, a hairline in the same hue, and the move printed with an arrow, so
 * colour never carries the meaning alone. Server-rendered; the hover card is
 * pure CSS.
 */

const cents = (p: number) => `${Math.round(p * 100)}¢`;
/** Tile meta has the least room on the page: whole thousands below a million ($926K, not $926.1K). */
const short = (n: number) => (n >= 999_500 || n < 1_000 ? compact(n) : `${Math.round(n / 1_000)}K`);
const signedPct = (c: number) => (moveDirection(c) === "flat" ? "0%" : `${c > 0 ? "+" : "−"}${Math.round(Math.abs(c) * 100)}%`);

function describe(s: ConsensusHolding, change: number): string {
  const dir = moveDirection(change);
  const move = dir === "flat" ? "price unchanged" : `price ${dir} ${Math.round(Math.abs(change) * 100)}%`;
  return `${s.title}: ${s.holders} top traders bet ${s.outcome}, $${compact(s.totalValue)} invested, ${move} since they bought. Open the signal.`;
}

/** The signed move with its arrow, in the up/down ink (see .map-ink). */
function Change({ change, className }: { change: number; className?: string }) {
  const dir = moveDirection(change);
  const Icon = dir === "flat" ? ArrowRight : dir === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <span data-ink={dir} className={cn("map-ink figure inline-flex shrink-0 items-center gap-0.5 font-semibold", className)}>
      <Icon className="size-[1em] shrink-0" aria-hidden="true" />
      {signedPct(change)}
    </span>
  );
}

function tintOf(change: number) {
  const tier = moveTier(change);
  return { "data-dir": tier === 0 ? "flat" : change > 0 ? "up" : "down", "data-tier": tier };
}

/**
 * The biggest tile, when it holds a quarter of the map or more, gets the same
 * composition as a signal card: what, who, how much, and how it has gone,
 * plus the three biggest holders when there is room. Type sizes follow the
 * tile (container units), so it reads at any width.
 */
function HeroTile({ s }: { s: ConsensusHolding }) {
  const change = sinceEntry(s);
  const end = fmtEnd(s.endDate);
  const holders = (s.topHolders ?? []).slice(0, 3);
  return (
    <Link href={`/consensus/${s.tokenId}`} aria-label={describe(s, change)} {...tintOf(change)} className="map-tint map-tile map-hero flex h-full w-full flex-col overflow-hidden rounded-lg p-4 sm:p-5">
      <span className="hero-cat mb-2 items-center justify-between gap-3">
        <span className="truncate text-[11px] text-muted-foreground">
          {s.category}
          {end ? ` · ends ${end}` : ""}
        </span>
        <SignalBadge h={s} className="hero-badge" />
      </span>
      <span className="hero-title font-medium leading-snug tracking-tight text-foreground">{s.title}</span>
      <span className="hero-who mt-3 items-center gap-2 text-xs text-muted-foreground">
        <AvatarStack holders={s.topHolders ?? []} total={s.holders} max={4} size={22} />
        <span>
          <span className="tabular font-medium text-foreground">{s.holders}</span> top traders bet
        </span>
        <SidePill outcome={s.outcome} />
      </span>
      <span className="mt-auto flex flex-col gap-6 pt-3">
        {holders.length > 0 && (
          <span className="hero-holders max-w-md flex-col gap-2">
            <span className="label-micro text-[10px]">Biggest holders</span>
            {holders.map((t) => {
              const share = s.totalValue > 0 ? t.value / s.totalValue : 0;
              return (
                <span key={t.wallet} className="grid grid-cols-[1.125rem_minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2.5 text-xs">
                  <TraderAvatar wallet={t.wallet} name={t.name} size={18} />
                  <span className="truncate text-foreground/90">{t.name}</span>
                  <span className="h-1 rounded-full bg-foreground/10" aria-hidden="true">
                    <span className="block h-full rounded-full bg-foreground/45" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </span>
                  <span className="tabular text-right text-muted-foreground">
                    <span className="text-foreground/85">${compact(t.value)}</span> · {Math.round(share * 100)}%
                  </span>
                </span>
              );
            })}
          </span>
        )}
        <span className="flex items-end justify-between gap-4">
          <span className="min-w-0">
            <span className="hero-figure figure block font-semibold leading-none text-foreground">${compact(s.totalValue)}</span>
            <span className="mt-1.5 block text-xs text-muted-foreground">invested</span>
          </span>
          <span className="flex flex-col items-end text-right">
            <Change change={change} className="hero-chg leading-none" />
            <span className="hero-paid mt-1.5 text-xs text-muted-foreground">
              Paid <span className="tabular text-foreground/85">{cents(s.avgEntry)}</span> → now <span className="tabular text-foreground/85">{cents(s.currentPrice)}</span>
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}

function Tile({ s }: { s: ConsensusHolding }) {
  const change = sinceEntry(s);
  return (
    <Link href={`/consensus/${s.tokenId}`} aria-label={describe(s, change)} {...tintOf(change)} className="map-tint map-tile block h-full w-full overflow-hidden rounded-lg">
      <span className="map-body flex h-full flex-col gap-1">
        <span className="map-title font-medium text-foreground/90">{s.title}</span>
        <span className="map-who text-[11px] text-muted-foreground">
          <span className="tabular text-foreground/85">{s.holders}</span> top traders
        </span>
        <span className="mt-auto flex items-end justify-between gap-2">
          <span className="map-side min-w-0 items-center gap-1.5">
            <SidePill outcome={s.outcome} />
            <span className="figure truncate text-[12px] text-foreground/80">${short(s.totalValue)}</span>
          </span>
          <Change change={change} className="map-chg ml-auto" />
        </span>
      </span>
    </Link>
  );
}

/** What a tile is too small to print, styled like the chart tooltips. Hover-capable devices only; the tile's aria-label already says it all. */
function HoverCard({ s, above, alignRight }: { s: ConsensusHolding; above: boolean; alignRight: boolean }) {
  const change = sinceEntry(s);
  const row = "flex items-center justify-between gap-4";
  return (
    <div aria-hidden="true" className={cn("map-card absolute z-10 w-64 rounded-lg border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur", above ? "bottom-full" : "top-full", alignRight ? "right-0" : "left-0")}>
      <p className="font-medium leading-snug text-foreground">{s.title}</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <div className={row}>
          <span>Top traders</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular font-medium text-foreground">{s.holders}</span> on <SidePill outcome={s.outcome} />
          </span>
        </div>
        <div className={row}>
          <span>Invested</span>
          <span className="tabular font-medium text-foreground">${compact(s.totalValue)}</span>
        </div>
        <div className={row}>
          <span>Paid → now</span>
          <span className="tabular font-medium text-foreground">
            {cents(s.avgEntry)} → {cents(s.currentPrice)}
          </span>
        </div>
        <div className={row}>
          <span>Since they bought</span>
          <Change change={change} />
        </div>
      </div>
    </div>
  );
}

function Tiles({ tiles, w, h }: { tiles: Array<{ item: ConsensusHolding; rect: Rect }>; w: number; h: number }) {
  const pos = (r: Rect) => ({ left: `${(r.x / w) * 100}%`, top: `${(r.y / h) * 100}%`, width: `${(r.w / w) * 100}%`, height: `${(r.h / h) * 100}%` });
  return (
    <ul className="relative h-full w-full" aria-label="Smart money map, biggest money first">
      {tiles.map(({ item: s, rect }, i) => {
        const hero = i === 0 && rect.w * rect.h >= 0.25 * w * h;
        return (
          <li key={s.tokenId} className="map-cell absolute p-[3px]" style={pos(rect)}>
            {hero ? (
              <HeroTile s={s} />
            ) : (
              <>
                <Tile s={s} />
                <HoverCard s={s} above={rect.y + rect.h / 2 > h / 2} alignRight={rect.x + rect.w / 2 > w / 2} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The tint buckets in order, down to up; boundaries are labelled, not buckets, so each cut point is stated exactly. */
const SCALE = [
  { dir: "down", tier: 3 },
  { dir: "down", tier: 2 },
  { dir: "down", tier: 1 },
  { dir: "flat", tier: 0 },
  { dir: "up", tier: 1 },
  { dir: "up", tier: 2 },
  { dir: "up", tier: 3 },
] as const;
const CUTS = ["−20%", "−8%", "−2%", "+2%", "+8%", "+20%"];
const SWATCH = 32; // px, plus a 3px gap

function Legend() {
  return (
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
      <span className="sr-only">Tint shows the price move since the traders bought: three shades of orange for down 2 to 8%, 8 to 20%, and more than 20%; neutral for under 2% either way; three shades of green for the same steps up.</span>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5 leading-[0.5rem]">
        <ArrowDownRight className="size-3" /> Down
      </span>
      <span aria-hidden="true" className="relative block pb-4">
        <span className="flex gap-[3px]">
          {SCALE.map((t) => (
            <span key={`${t.dir}${t.tier}`} data-dir={t.dir} data-tier={t.tier} className="map-tint block h-2 rounded-[3px]" style={{ width: SWATCH }} />
          ))}
        </span>
        {CUTS.map((c, i) => (
          <span key={c} className="tabular absolute top-3 -translate-x-1/2 text-[10px]" style={{ left: (i + 1) * (SWATCH + 3) - 1.5 }}>
            {c}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5 leading-[0.5rem]">
        Up <ArrowUpRight className="size-3" />
      </span>
    </div>
  );
}

/**
 * One layout per screen class, so tiles stay close to square and big enough to
 * read: tall for phones, 2:1 for tablets and laptops, wide for big screens.
 * Minimum sides are in layout units and work out to roughly 55px or more at
 * the narrowest width each layout serves. Each draws only the signals big
 * enough to read; the full list sits right below the map (#all-signals).
 */
const LAYOUTS = [
  { key: "phone", box: "aspect-[4/5] sm:hidden", caption: "sm:hidden", w: 100, h: 125, minShare: 0.025, max: 8, minSide: 18 },
  { key: "mid", box: "hidden aspect-[2/1] sm:block xl:hidden", caption: "hidden sm:inline xl:hidden", w: 200, h: 100, minShare: 0.02, max: 10, minSide: 20 },
  { key: "wide", box: "hidden aspect-[12/5] xl:block", caption: "hidden xl:inline", w: 240, h: 100, minShare: 0.01, max: 14, minSide: 14 },
] as const;

export function MoneyMap({ signals }: { signals: ConsensusHolding[] }) {
  if (signals.length < 3) return null;
  const value = (s: ConsensusHolding) => s.totalValue;
  const layouts = LAYOUTS.map((l) => ({ ...l, tiles: legibleTreemap(takeLargest(signals, value, { minShare: l.minShare, max: l.max }), value, { x: 0, y: 0, w: l.w, h: l.h }, { minSide: l.minSide }) }));
  const m = moneyByMove(signals);
  const share = (v: number) => Math.round((v / (m.total || 1)) * 100);
  const shown = (n: number) => (n >= signals.length ? `All ${signals.length} live signals.` : `The ${n} biggest of ${signals.length} live signals.`);
  return (
    <div>
      {layouts.map((l) => (
        <div key={l.key} className={l.box}>
          <Tiles tiles={l.tiles} w={l.w} h={l.h} />
        </div>
      ))}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            Of the <span className="tabular font-medium text-foreground">${compact(m.total)}</span> top traders have in live signals,{" "}
            <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
              <ArrowUpRight className="size-3.5 self-center text-status-good" aria-hidden="true" />
              <span className="tabular font-medium text-foreground">{share(m.up)}%</span>
            </span>{" "}
            is up since they bought and{" "}
            <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
              <ArrowDownRight className="size-3.5 self-center text-chart-2" aria-hidden="true" />
              <span className="tabular font-medium text-foreground">{share(m.down)}%</span>
            </span>{" "}
            is down.
          </p>
          <p>
            {layouts.map((l) => (
              <span key={l.key} className={l.caption}>
                {shown(l.tiles.length)}
              </span>
            ))}{" "}
            <a href="#all-signals" className="font-medium text-primary hover:underline">
              See every signal ↓
            </a>
          </p>
        </div>
        <Legend />
      </div>
    </div>
  );
}
