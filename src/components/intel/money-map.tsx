import Link from "next/link";
import type { ConsensusHolding } from "@/lib/whales";
import { compact } from "@/lib/format";
import { squarify } from "@/lib/treemap";
import { cn } from "@/lib/utils";

/**
 * Move since the traders bought, bucketed. Tiers, not a ramp: a reader should
 * be able to name the bucket at a glance. Green = up, orange = down (the two
 * reserved meaning colours), grey = flat; every tile also prints the signed
 * figure, so the map reads the same in greyscale.
 */
function tone(change: number): string {
  const a = Math.abs(change);
  if (a < 0.02) return "bg-surface-3 text-foreground";
  const hue = change > 0 ? "status-good" : "chart-2";
  if (a < 0.08) return `map-${hue}-1`;
  if (a < 0.2) return `map-${hue}-2`;
  return `map-${hue}-3`;
}

const LEGEND: Array<{ label: string; cls: string }> = [
  { label: "−20%+", cls: "map-chart-2-3" },
  { label: "−8%", cls: "map-chart-2-2" },
  { label: "−2%", cls: "map-chart-2-1" },
  { label: "flat", cls: "bg-surface-3" },
  { label: "+2%", cls: "map-status-good-1" },
  { label: "+8%", cls: "map-status-good-2" },
  { label: "+20%+", cls: "map-status-good-3" },
];

const signedPct = (c: number) => `${c >= 0 ? "+" : "−"}${Math.round(Math.abs(c) * 100)}%`;

function Tiles({ signals, w, h, className }: { signals: ConsensusHolding[]; w: number; h: number; className?: string }) {
  const tiles = squarify(signals, (s) => s.totalValue, { x: 0, y: 0, w, h });
  return (
    <ul className={cn("relative h-full w-full", className)}>
      {tiles.map(({ item: s, rect }) => {
        const change = s.avgEntry > 0 ? (s.currentPrice - s.avgEntry) / s.avgEntry : 0;
        return (
          <li key={s.tokenId} className="absolute p-[2px]" style={{ left: `${(rect.x / w) * 100}%`, top: `${(rect.y / h) * 100}%`, width: `${(rect.w / w) * 100}%`, height: `${(rect.h / h) * 100}%` }}>
            <Link
              href={`/consensus/${s.tokenId}`}
              title={`${s.title} · ${s.holders} top traders bet ${s.outcome} · $${compact(s.totalValue)} invested · ${signedPct(change)} since they bought`}
              aria-label={`${s.title}: ${s.holders} top traders bet ${s.outcome}, $${compact(s.totalValue)} invested, price ${change >= 0 ? "up" : "down"} ${Math.round(Math.abs(change) * 100)}% since they bought`}
              className={cn("map-tile flex h-full w-full flex-col justify-between overflow-hidden rounded-md p-2 transition-[filter,box-shadow] duration-150 hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring", tone(change))}
            >
              <span className="map-title line-clamp-3 text-[12px] font-medium leading-snug">{s.title}</span>
              <span className="map-meta flex items-end justify-between gap-2">
                <span className="map-side truncate text-[11px] font-semibold uppercase tracking-wide opacity-90">
                  {s.outcome} · ${compact(s.totalValue)}
                </span>
                <span className="map-chg figure shrink-0 text-sm font-semibold">{signedPct(change)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The smart-money map: every live signal as a tile, sized by the dollars the
 * top traders have on it and coloured by how the price has moved since they
 * bought. One picture answers "where is the money, and is it working?".
 * Server-rendered, zero client JS; each tile is a real link to the signal.
 * Two layouts (wide for desktop, tall for phones) so tiles stay near-square.
 */
export function MoneyMap({ signals }: { signals: ConsensusHolding[] }) {
  if (signals.length < 3) return null;
  return (
    <div>
      <div className="hidden aspect-[12/5] sm:block">
        <Tiles signals={signals} w={240} h={100} />
      </div>
      <div className="aspect-[4/5] sm:hidden">
        {/* Phones get the 18 biggest: past that, tiles shrink to dots. */}
        <Tiles signals={signals.slice(0, 18)} w={100} h={125} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
        <span>Tile size = dollars the top traders have on it · colour = price move since they bought</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex flex-col items-center gap-1">
              <span className={cn("block h-2.5 w-8 rounded-sm", l.cls)} />
              <span className="tabular">{l.label}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
