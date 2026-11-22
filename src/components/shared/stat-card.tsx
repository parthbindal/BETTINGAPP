import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
  children,
  className,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" } | null;
  hint?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "default" | "demo";
}) {
  return (
    <div className={cn("card-surface flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="figure text-2xl font-semibold">{value}</span>
        {delta && (
          <span
            className={cn(
              "tabular text-xs font-medium",
              delta.direction === "up" && "text-status-good",
              delta.direction === "down" && "text-status-critical",
              delta.direction === "flat" && "text-muted-foreground",
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {tone === "demo" && <p className="text-[11px] text-status-serious">Sample data</p>}
      {children}
    </div>
  );
}
