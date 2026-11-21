"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { ChartTooltipFrame } from "./chart-tooltip";
import { compact } from "@/lib/format";

/** How the hovered value is printed. A string key, not a function: formatters
 * cannot cross the Server Component boundary. */
export type SparkFormat = "number" | "compact" | "decimal";

function formatValue(kind: SparkFormat, v: number): string {
  if (kind === "compact") return compact(v);
  if (kind === "decimal") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

export function Sparkline({
  data,
  color = "var(--chart-1)",
  height = 32,
  interactive = false,
  valueLabel = "Value",
  valueFormat = "number",
  pointLabels,
}: {
  data: number[];
  color?: string;
  height?: number;
  /** Enable hover tooltip and a focus dot so the actual value is readable. */
  interactive?: boolean;
  valueLabel?: string;
  valueFormat?: SparkFormat;
  /** Optional per-point captions (e.g. dates), same order as `data`. */
  pointLabels?: string[];
}) {
  if (data.length < 2) return <div style={{ height }} />;
  const rows = data.map((v, i) => ({ i, v, label: pointLabels?.[i] }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          {interactive && (
            <Tooltip
              cursor={{ stroke: "oklch(1 0 0 / 25%)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof rows)[number];
                return <ChartTooltipFrame title={p.label} rows={[{ label: valueLabel, value: formatValue(valueFormat, p.v), color }]} />;
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={interactive ? { r: 3, stroke: "var(--card)", strokeWidth: 1.5 } : false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
