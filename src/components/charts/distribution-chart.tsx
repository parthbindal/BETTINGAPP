"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipFrame } from "./chart-tooltip";
import { ChartFrame } from "./chart-frame";

export function DistributionChart({
  bins,
  line,
  height = 200,
  isLoading = false,
  error = null,
}: {
  bins: Array<{ from: number; to: number; count: number }>;
  line: number;
  height?: number;
  isLoading?: boolean;
  error?: string | null;
}) {
  const rows = bins.map((b) => ({ label: b.to - b.from <= 1 ? `${b.from}` : `${b.from}–${b.to - (Number.isInteger(b.to) ? 1 : 0)}`, mid: (b.from + b.to) / 2, count: b.count, over: b.from > line }));
  const total = rows.reduce((a, r) => a + r.count, 0);

  return (
    <ChartFrame
      height={height}
      legend={[
        { label: `Over ${line}`, color: "var(--chart-1)" },
        { label: `Under ${line}`, color: "color-mix(in oklab, var(--chart-1) 40%, transparent)" },
      ]}
      isLoading={isLoading}
      isEmpty={!rows.length}
      error={error}
      emptyText="No game logs available."
      skeletonVariant="bars"
      ariaLabel={`Distribution of results around the ${line} line`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "oklch(1 0 0 / 5%)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as (typeof rows)[number];
              return <ChartTooltipFrame title={`Range ${p.label}`} rows={[{ label: "Games", value: p.count }, { label: "Share", value: `${((p.count / total) * 100).toFixed(0)}%` }]} />;
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill="var(--chart-1)" fillOpacity={r.over ? 0.95 : 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
