"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ChartSkeleton } from "./chart-skeleton";
import { cn } from "@/lib/utils";

export type ChartSeries = { label: string; color: string };

/** Swatch-and-label key for multi-series charts. */
export function ChartLegend({ series, className }: { series: ChartSeries[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {series.map((s) => (
        <li key={s.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Trailing-window selector (7D / 30D / ALL). Client state only: it narrows data
 * the chart already holds, so it never refetches.
 */
export function ChartRangeTabs<T extends string>({
  value,
  options,
  onChange,
  label = "Time range",
  className,
}: {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (key: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-lg border border-border bg-surface-1 p-0.5", className)}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared chassis for every chart: optional legend row and action slot, a fixed
 * plot area, and the three non-happy states (loading, empty, error) rendered
 * at the same height so the page never reflows.
 *
 * Inside a `Section`, leave `title` unset: the section already names the
 * chart. Use `title` / `subtitle` for charts that stand on their own.
 */
export function ChartFrame({
  title,
  subtitle,
  height = 240,
  legend,
  action,
  isLoading = false,
  isEmpty = false,
  error = null,
  emptyText = "No data to chart yet.",
  skeletonVariant = "bars",
  ariaLabel,
  footnote,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Plot height in px, or "auto" for HTML charts that size to their rows. */
  height?: number | "auto";
  legend?: ChartSeries[];
  action?: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  emptyText?: ReactNode;
  skeletonVariant?: "bars" | "line" | "area";
  ariaLabel?: string;
  footnote?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const showHeader = Boolean(legend?.length) || Boolean(action);
  // Non-happy states keep a stable box even when the chart itself sizes to content.
  const stateHeight = height === "auto" ? 160 : height;
  const plotHeight = height === "auto" ? undefined : height;

  return (
    <div className={className}>
      {(title || subtitle) && (
        <div className="mb-2">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      {showHeader && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {legend?.length ? <ChartLegend series={legend} /> : <span />}
          {action}
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-status-critical/40 px-6 text-center"
          style={{ height: stateHeight }}
        >
          <AlertTriangle className="size-5 text-status-critical" aria-hidden="true" />
          <span className="text-sm font-medium">Could not load this chart</span>
          <span className="max-w-sm text-xs text-muted-foreground">{error}</span>
        </div>
      ) : isLoading ? (
        <div style={{ height: stateHeight }} aria-busy="true">
          <ChartSkeleton variant={skeletonVariant} height={stateHeight} />
          <span className="sr-only">Loading chart data</span>
        </div>
      ) : isEmpty ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground" style={{ height: stateHeight }}>
          {emptyText}
        </div>
      ) : (
        <div className="chart-mount" style={{ height: plotHeight }} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
          {children}
        </div>
      )}

      {footnote && !error && <div className="mt-2 text-[11px] text-muted-foreground">{footnote}</div>}
    </div>
  );
}
