import { compact } from "@/lib/format";
import { standingLabel } from "@/lib/intel";
import { cn } from "@/lib/utils";

export interface Standing {
  label: string;
  value: string; // this trader's own figure, printed beside the meter
  p: number | null; // share of the tracked traders this one beats, 0..1
  detail: string;
}

/**
 * How one trader compares with the other traders EDGEWISE tracks, one meter
 * per measure. A transparent alternative to a single opaque "smart score":
 * every row says what it measures, against whom, and where this trader sits.
 */
export function TraderStanding({ rows }: { rows: Standing[] }) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{r.label}</span>
            <span className={cn("tabular text-sm font-semibold", r.p === null && "text-muted-foreground")}>{r.p === null ? "n/a" : standingLabel(r.p)}</span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-surface-3" role="img" aria-label={r.p === null ? `${r.label}: not available` : `${r.label}: beats ${Math.round(r.p * 100)}% of tracked traders`}>
            {[25, 50, 75].map((t) => (
              <span key={t} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${t}%` }} aria-hidden="true" />
            ))}
            {r.p !== null && (
              <>
                <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/45" style={{ width: `${r.p * 100}%` }} aria-hidden="true" />
                <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card" style={{ left: `${r.p * 100}%` }} aria-hidden="true" />
              </>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>{r.detail}</span>
            <span className="tabular shrink-0 text-foreground/80">{r.value}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Category slots in palette order, skipping the two reserved for meaning (chart-2 down, chart-6 up). */
const SLOTS = ["bg-chart-1", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-7", "bg-chart-8"] as const;

/** Where a book's money sits, as one segmented bar with a legend. */
export function AllocationBar({ items, unit = "open value" }: { items: Array<{ label: string; value: number }>; unit?: string }) {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (!total) return null;
  const top = sorted.slice(0, SLOTS.length);
  const rest = sorted.slice(SLOTS.length).reduce((s, i) => s + i.value, 0);
  const pct = (v: number) => (v / total) * 100;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={top.map((i) => `${i.label} ${Math.round(pct(i.value))}%`).join(", ")}>
        {top.map((i, n) => (
          <span key={i.label} className={SLOTS[n]} style={{ width: `${pct(i.value)}%` }} />
        ))}
        {rest > 0 && <span className="bg-muted-foreground/35" style={{ width: `${pct(rest)}%` }} />}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {top.map((i, n) => (
          <li key={i.label} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", SLOTS[n])} aria-hidden="true" />
            <span>{i.label}</span>
            <span className="tabular text-muted-foreground">
              {Math.round(pct(i.value))}% · ${compact(i.value)}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted-foreground/35" aria-hidden="true" />
            <span className="text-muted-foreground">Other {Math.round(pct(rest))}%</span>
          </li>
        )}
      </ul>
      <span className="sr-only">Share of {unit} by category.</span>
    </div>
  );
}
