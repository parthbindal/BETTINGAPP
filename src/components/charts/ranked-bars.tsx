"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact } from "@/lib/format";
import { ChartTooltipFrame } from "./chart-tooltip";

/**
 * How values are printed. A string key rather than a formatter function:
 * functions cannot be passed from a Server Component into this Client Component.
 */
export type ValueFormat = "number" | "compact";

function formatValue(kind: ValueFormat, v: number): string {
  return kind === "compact" ? compact(v) : Math.round(v).toLocaleString("en-US");
}

/** Ranked horizontal bars, one hue. */
export function RankedBars({ data, height, valueLabel = "Value", valueFormat = "number" }: { data: Array<{ name: string; value: number; highlight?: boolean }>; height?: number; valueLabel?: string; valueFormat?: ValueFormat }) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  const h = height ?? Math.max(120, rows.length * 28 + 16);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }} barCategoryGap={4}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "oklch(1 0 0 / 5%)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <ChartTooltipFrame title={(payload[0]!.payload as { name: string }).name} rows={[{ label: valueLabel, value: formatValue(valueFormat, Number(payload[0]!.value)) }]} />
              ) : null
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)", formatter: (v: unknown) => formatValue(valueFormat, Number(v)) }}>
            {rows.map((r, i) => (
              <Cell key={i} fill="var(--chart-1)" fillOpacity={r.highlight === false ? 0.35 : 0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
