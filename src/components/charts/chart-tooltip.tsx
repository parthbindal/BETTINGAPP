"use client";

import type { ReactNode } from "react";

export function ChartTooltipFrame({ title, rows }: { title?: ReactNode; rows: Array<{ label: string; value: ReactNode; color?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {title && <div className="mb-1 font-medium text-foreground">{title}</div>}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular font-medium text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
