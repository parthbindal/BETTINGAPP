"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartFrame } from "./chart-frame";
import { ChartTooltipFrame } from "./chart-tooltip";
import { compact } from "@/lib/format";

export interface EntryPoint {
  name: string;
  rank: number;
  value: number; // USD on this side now
  t: number; // first entry, ms since epoch
}

const DAY_MS = 86_400_000;
const label = (long: boolean) => (t: number) => new Date(t).toLocaleDateString("en-US", long ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });

/** Five evenly spaced ticks across the data, so the axis always reads as a timeline. */
function ticksFor(rows: EntryPoint[]): number[] {
  if (rows.length < 2) return [];
  const min = Math.min(...rows.map((r) => r.t));
  const max = Math.max(...rows.map((r) => r.t));
  if (max - min < DAY_MS) return [min, max];
  return Array.from({ length: 5 }, (_, i) => Math.round(min + ((max - min) * i) / 4));
}

/**
 * When each of the biggest holders first bought this side, and how big the
 * position is now: x = entry date, y = dollars (log scale, so a $9M whale and
 * a $20K holder both stay readable), dot area = dollars too. A tight vertical
 * band means a coordinated move; a long smear means conviction built over time.
 */
export function EntryTimeline({ points, height = 260 }: { points: EntryPoint[]; height?: number }) {
  const rows = points.filter((p) => Number.isFinite(p.t) && p.value > 0);
  const ticks = ticksFor(rows);
  const long = ticks.length > 1 && ticks[ticks.length - 1]! - ticks[0]! > 200 * DAY_MS;
  return (
    <ChartFrame
      height={height}
      isEmpty={rows.length < 2}
      emptyText="Entry times are not available for enough of these holders yet."
      ariaLabel={`Entry dates and position sizes of ${rows.length} top holders`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="0" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={label(long)} tickLine={false} axisLine={false} interval={0} padding={{ left: 14, right: 14 }} />
          <YAxis dataKey="value" type="number" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => `$${compact(v)}`} tickLine={false} axisLine={false} width={54} />
          <ZAxis dataKey="value" type="number" range={[40, 420]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as EntryPoint;
              return (
                <ChartTooltipFrame
                  title={`#${p.rank} ${p.name}`}
                  rows={[
                    { label: "First bought", value: new Date(p.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                    { label: "Position now", value: `$${compact(p.value)}`, color: "var(--chart-1)" },
                  ]}
                />
              );
            }}
          />
          <Scatter data={rows} fill="var(--chart-1)" fillOpacity={0.55} stroke="var(--chart-1)" strokeWidth={1.5} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
