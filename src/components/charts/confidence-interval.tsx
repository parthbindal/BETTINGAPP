"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ChartFrame } from "./chart-frame";
import { wilsonInterval } from "@/lib/analytics/probability";
import { cn } from "@/lib/utils";

export interface IntervalRow {
  label: string;
  /** Successes (e.g. games over the line). */
  hits: number;
  /** Trials. Rows with n = 0 are dropped: there is nothing to estimate. */
  n: number;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1];
const at = (p: number) => `${(p * 100).toFixed(2)}%`;
const pct0 = (p: number) => `${Math.round(p * 100)}%`;

/**
 * Point estimate with its 95% Wilson interval, one row per sample. Turns a
 * bare "73%" into "73% ±6, n=42" so the evidence behind each number is
 * visible: a wide bar means little evidence, however striking the dot looks.
 *
 * Every row shares one 0–100% axis so widths compare honestly. An optional
 * `reference` (a model estimate or market price) is drawn as a vertical rule
 * through all rows. Small samples get a dashed bar plus an icon and the words
 * "small sample", never color alone.
 */
export function ConfidenceInterval({
  rows,
  reference,
  title,
  subtitle,
  footnote = "Bars show the 95% range (Wilson interval). A wider bar means less evidence.",
  smallSample = 10,
  isLoading = false,
  error = null,
  emptyText = "No samples to estimate from yet.",
  className,
}: {
  rows: IntervalRow[];
  reference?: { value: number; label: string } | null;
  title?: ReactNode;
  subtitle?: ReactNode;
  footnote?: ReactNode;
  smallSample?: number;
  isLoading?: boolean;
  error?: string | null;
  emptyText?: ReactNode;
  className?: string;
}) {
  const items = rows
    .filter((r) => r.n > 0)
    .map((r) => {
      const point = r.hits / r.n;
      const { low, high } = wilsonInterval(r.hits, r.n);
      return { ...r, point, low, high, plusMinus: Math.round(((high - low) / 2) * 100), small: r.n < smallSample };
    });
  const ref = reference && Number.isFinite(reference.value) ? { ...reference, value: Math.min(1, Math.max(0, reference.value)) } : null;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      height="auto"
      legend={ref ? [{ label: "Hit rate with 95% range", color: "var(--chart-1)" }, { label: `${ref.label} ${pct0(ref.value)}`, color: "var(--chart-7)" }] : undefined}
      isLoading={isLoading}
      isEmpty={items.length === 0}
      error={error}
      emptyText={emptyText}
      skeletonVariant="bars"
      footnote={footnote}
      className={className}
    >
      <ul className="@container space-y-2.5" aria-label={typeof title === "string" ? title : "Estimates with 95% confidence ranges"}>
        {items.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 @md:grid-cols-[5.5rem_minmax(0,1fr)_8.5rem]"
          >
            <span className="truncate text-xs text-muted-foreground @md:col-start-1 @md:row-start-1">{r.label}</span>

            <span className="text-right text-xs @md:col-start-3 @md:row-start-1">
              <span className="tabular text-sm font-semibold">{pct0(r.point)}</span>
              <span className="tabular text-muted-foreground"> ±{r.plusMinus} · n={r.n}</span>
              <span className="sr-only">
                , {r.hits} of {r.n}. 95% range {pct0(r.low)} to {pct0(r.high)}.{r.small ? " Small sample." : ""}
              </span>
            </span>

            <div
              className="relative col-span-2 h-5 @md:col-span-1 @md:col-start-2 @md:row-start-1"
              title={`${r.hits} of ${r.n} · 95% range ${pct0(r.low)}–${pct0(r.high)} (Wilson)`}
              aria-hidden="true"
            >
              {TICKS.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-border/70" style={{ left: at(t) }} />
              ))}
              {ref && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-chart-7" style={{ left: at(ref.value) }} />}
              {/* whisker + end caps */}
              <span
                className={cn("absolute top-1/2 -translate-y-1/2", r.small ? "border-t-2 border-dashed border-chart-1" : "h-0.5 rounded-full bg-chart-1")}
                style={{ left: at(r.low), width: at(r.high - r.low) }}
              />
              <span className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1" style={{ left: at(r.low) }} />
              <span className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1" style={{ left: at(r.high) }} />
              {/* point estimate, ringed in the surface color so it reads over the reference rule */}
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-card" style={{ left: at(r.point) }} />
            </div>

            {r.small && (
              <span className="col-span-2 inline-flex items-center gap-1 text-[11px] text-status-warning @md:col-span-1 @md:col-start-2">
                <AlertTriangle className="size-3" aria-hidden="true" /> Small sample: treat as a rough guide
              </span>
            )}
          </li>
        ))}

        {/* shared axis */}
        <li aria-hidden="true" className="grid grid-cols-[1fr] @md:grid-cols-[5.5rem_minmax(0,1fr)_8.5rem] @md:gap-x-3">
          <div className="relative h-3 @md:col-start-2">
            {TICKS.map((t) => (
              <span
                key={t}
                className={cn("tabular absolute text-[10px] text-muted-foreground", t === 0 ? "" : t === 1 ? "-translate-x-full" : "-translate-x-1/2")}
                style={{ left: at(t) }}
              >
                {pct0(t)}
              </span>
            ))}
          </div>
        </li>
      </ul>
    </ChartFrame>
  );
}
