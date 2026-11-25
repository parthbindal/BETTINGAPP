import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The house way to show a number, lifted from the public track record so every
 * page states figures the same way: a micro label, the figure, and a foot line
 * that carries its denominator or source. A figure never stands alone. If
 * there is nothing honest to put under it, it does not belong in the band.
 */
export interface StatItem {
  label: string;
  value: ReactNode;
  foot: ReactNode;
}

/** Always white: primary blue means "click this", and a figure is not clickable, however important. */
export function Stat({ label, value, foot }: StatItem) {
  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <dt className="label-micro">{label}</dt>
      <dd className="figure mt-2 text-3xl font-semibold text-foreground sm:text-4xl">{value}</dd>
      <dd className="mt-1.5 text-xs leading-snug text-muted-foreground">{foot}</dd>
    </div>
  );
}

/**
 * Stats between hairlines, unboxed. Two columns on a phone (four tall cells
 * stacked would push the page's first real content off screen), then `columns`
 * across. Dividers are drawn per cell so they stay right at every breakpoint.
 */
export function StatBand({ stats, columns = 4, className }: { stats: StatItem[]; columns?: 2 | 4; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 [&>*]:border-border/60 [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t",
        columns === 4 && "lg:grid-cols-4 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0 lg:[&>*:nth-child(n+3)]:border-t-0",
        className,
      )}
    >
      {stats.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </dl>
  );
}

/** A change since the previous scan, in words as well as an arrow, never in color: direction is not a result. */
export function ScanDelta({ change }: { change: { pct: number } | null | undefined }) {
  if (!change || Math.abs(change.pct) < 0.005) return null;
  const up = change.pct >= 0;
  return (
    // Its own line on a phone, where a half-width cell cannot hold the figure and the note side by side.
    <span className="mt-1 block text-xs font-medium tracking-normal whitespace-nowrap text-muted-foreground tabular sm:mt-0 sm:ml-2 sm:inline sm:align-middle">
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {Math.round(Math.abs(change.pct) * 100)}%<span className="sr-only">{up ? " up" : " down"}</span> vs last scan
    </span>
  );
}
