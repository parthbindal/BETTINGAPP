import { cn } from "@/lib/utils";
import { pct } from "@/lib/format";

/** Two markers on one track: market-implied vs model estimate. Text never wears the data color. */
export function ProbabilityBar({ market, model, className }: { market: number | null; model: number | null; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative h-2 rounded-full bg-surface-3">
        {market !== null && (
          <div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-chart-1 ring-2 ring-card" style={{ left: `calc(${market * 100}% - 1px)` }} />
        )}
        {model !== null && (
          <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-7 ring-2 ring-card" style={{ left: `${model * 100}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-chart-1/25" style={{ width: `${(market ?? 0) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-0.5 bg-chart-1" /> Market {pct(market, 1)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-chart-7" /> Model {pct(model, 1)}
        </span>
      </div>
    </div>
  );
}
