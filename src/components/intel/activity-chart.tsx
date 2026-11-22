"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipFrame } from "@/components/charts/chart-tooltip";
import { ChartFrame, ChartRangeTabs } from "@/components/charts/chart-frame";
import { compact } from "@/lib/format";

type Row = { day: string; buys: number; sells: number; trades: number; partial?: boolean };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const LEGEND = [
  { label: "Bought", color: "var(--foreground)" },
  { label: "Sold", color: "var(--muted-foreground)" },
];

/**
 * Dollar volume the tracked traders bought and sold per day, stacked with a
 * surface gap. Bought/sold are neutral (white / grey) on purpose: blue means
 * "click" and orange means "price fell" (see the color map in globals.css).
 *
 * `ranges` adds a trailing-window selector. Omit it on pages that already have
 * their own range control (e.g. /overview) so the two cannot disagree.
 */
export function ActivityChart({
  data,
  height = 260,
  emptyText = "No trades of $300+ from tracked traders in this range.",
  ranges,
  isLoading = false,
  error = null,
}: {
  data: Row[];
  height?: number;
  emptyText?: string;
  ranges?: number[];
  isLoading?: boolean;
  error?: string | null;
}) {
  const options = useMemo(() => {
    if (!ranges?.length) return [];
    const usable = ranges.filter((d) => d < data.length);
    return [...usable.map((d) => ({ key: String(d), label: `${d}D` })), { key: "all", label: "ALL" }];
  }, [ranges, data.length]);

  const [range, setRange] = useState<string>(() => (options.length > 1 ? options[0]!.key : "all"));

  const rows = useMemo(() => {
    if (range === "all") return data;
    const days = Number(range);
    return Number.isFinite(days) ? data.slice(-days) : data;
  }, [data, range]);

  const hasAny = rows.some((d) => d.buys > 0 || d.sells > 0);

  return (
    <ChartFrame
      height={height}
      legend={LEGEND}
      action={options.length > 1 ? <ChartRangeTabs value={range} options={options} onChange={setRange} /> : undefined}
      isLoading={isLoading}
      isEmpty={!hasAny}
      error={error}
      emptyText={emptyText}
      skeletonVariant="bars"
      ariaLabel="Daily dollar volume bought and sold by tracked traders"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
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
                    { label: "Bought", value: `$${compact(r.buys)}`, color: "var(--foreground)" },
                    { label: "Sold", value: `$${compact(r.sells)}`, color: "var(--muted-foreground)" },
                    { label: "Trades", value: r.trades.toLocaleString("en-US") },
                    ...(r.partial ? [{ label: "Coverage", value: "May undercount the busiest traders" }] : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="buys" stackId="flow" fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
            {rows.map((d) => <Cell key={d.day} fillOpacity={d.partial ? 0.3 : 0.85} />)}
          </Bar>
          <Bar dataKey="sells" stackId="flow" fill="var(--muted-foreground)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((d) => <Cell key={d.day} fillOpacity={d.partial ? 0.3 : 0.75} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
