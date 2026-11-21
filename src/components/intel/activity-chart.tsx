"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipFrame } from "@/components/charts/chart-tooltip";
import { compact } from "@/lib/format";

type Row = { day: string; buys: number; sells: number; trades: number; partial?: boolean };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Dollar volume the tracked traders bought and sold per day. Two series in the
 * validated palette's first two slots (blue, orange), stacked, with a surface
 * gap between segments; the legend sits above the plot.
 */
export function ActivityChart({ data, height = 260, emptyText = "No trades of $300+ from tracked traders in this range." }: { data: Row[]; height?: number; emptyText?: string }) {
  const hasAny = data.some((d) => d.buys > 0 || d.sells > 0);
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden="true" /> Bought
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-2" aria-hidden="true" /> Sold
        </span>
      </div>
      {hasAny ? (
        <div style={{ height }} role="img" aria-label="Daily dollar volume bought and sold by tracked traders">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickFormatter={(v: number) => `$${compact(v)}`} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={52} />
              <Tooltip
                cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0]!.payload as Row;
                  return (
                    <ChartTooltipFrame
                      title={dayLabel(String(label))}
                      rows={[
                        { label: "Bought", value: `$${compact(r.buys)}`, color: "var(--chart-1)" },
                        { label: "Sold", value: `$${compact(r.sells)}`, color: "var(--chart-2)" },
                        { label: "Trades", value: r.trades.toLocaleString("en-US") },
                        ...(r.partial ? [{ label: "Coverage", value: "May undercount the busiest traders" }] : []),
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="buys" stackId="flow" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.day} fillOpacity={d.partial ? 0.4 : 1} />)}
              </Bar>
              <Bar dataKey="sells" stackId="flow" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.day} fillOpacity={d.partial ? 0.4 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground" style={{ height }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}
