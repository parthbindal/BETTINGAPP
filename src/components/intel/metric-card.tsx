import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A headline figure with its definition, its change since the previous scan,
 * and a sparkline. Change and trend appear only when a real earlier scan made
 * with the same method exists; nothing is extrapolated. Direction is shown in
 * neutral ink because more or less of a metric is not itself good or bad.
 */
export function MetricCard({
  label,
  value,
  hint,
  change,
  spark,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  change?: { pct: number; from: string } | null;
  spark?: number[];
  icon?: ReactNode;
  className?: string;
}) {
  const up = change ? change.pct >= 0 : false;
  return (
    <div className={cn("card-surface flex flex-col p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{value}</span>
        {change && (
          <span className="tabular inline-flex items-center gap-0.5 text-xs font-medium text-foreground/80" title={`Compared with the scan ${relative(change.from)}`}>
            {up ? <ArrowUpRight className="size-3.5 text-primary" aria-hidden="true" /> : <ArrowDownRight className="size-3.5 text-brand-violet" aria-hidden="true" />}
            {`${up ? "+" : ""}${(change.pct * 100).toFixed(1)}%`}
            <span className="sr-only">since the previous scan</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      <div className="mt-3 h-8">
        {spark && spark.length >= 2 ? (
          <Sparkline data={spark} color="var(--primary)" height={32} />
        ) : (
          <div className="flex h-full items-end text-[11px] text-muted-foreground/70">Trend appears after the next scan</div>
        )}
      </div>
    </div>
  );
}
