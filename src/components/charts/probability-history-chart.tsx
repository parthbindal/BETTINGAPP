"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Bar, BarChart } from "recharts";
import { format } from "date-fns";
import { ChartTooltipFrame } from "./chart-tooltip";
import { ChartFrame, ChartRangeTabs } from "./chart-frame";

export interface HistoryPoint {
  ts: number; // unix seconds
  close: number | null;
  bid?: number | null;
  ask?: number | null;
  volume?: number;
}

const C1 = "var(--chart-1)";
const DAY_SECONDS = 86_400;
const WINDOWS = [
  { key: "7", label: "7D", days: 7 },
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
] as const;

export function ProbabilityHistoryChart({
  data,
  period,
  marker,
  height = 260,
  showVolume = true,
  isLoading = false,
  error = null,
}: {
  data: HistoryPoint[];
  period: "hourly" | "daily";
  marker?: { value: number; label: string } | null;
  height?: number;
  showVolume?: boolean;
  isLoading?: boolean;
  error?: string | null;
}) {
  const all = useMemo(
    () =>
      data
        .filter((d) => d.close !== null)
        .map((d) => ({ ...d, t: d.ts * 1000, close: (d.close ?? 0) * 100, bid: d.bid != null ? d.bid * 100 : undefined, ask: d.ask != null ? d.ask * 100 : undefined })),
    [data],
  );

  // Only offer windows the data actually spans.
  const options = useMemo(() => {
    if (all.length < 2) return [];
    const spanDays = (all[all.length - 1]!.ts - all[0]!.ts) / DAY_SECONDS;
    const usable = WINDOWS.filter((w) => w.days < spanDays);
    return usable.length ? [...usable.map((w) => ({ key: w.key, label: w.label })), { key: "all", label: "ALL" }] : [];
  }, [all]);

  const [range, setRange] = useState<string>("all");

  const rows = useMemo(() => {
    if (range === "all" || !all.length) return all;
    const days = Number(range);
    if (!Number.isFinite(days)) return all;
    const cutoff = all[all.length - 1]!.ts - days * DAY_SECONDS;
    const windowed = all.filter((d) => d.ts >= cutoff);
    return windowed.length >= 2 ? windowed : all;
  }, [all, range]);

  const fmtX = (t: number) => format(new Date(t), period === "hourly" ? "MMM d HH:mm" : "MMM d");
  const hasVolume = showVolume && rows.some((r) => (r.volume ?? 0) > 0);

  return (
    <div className="space-y-1">
      <ChartFrame
        height={height}
        action={options.length > 1 ? <ChartRangeTabs value={range} options={options} onChange={setRange} label="Price history range" /> : undefined}
        isLoading={isLoading}
        isEmpty={rows.length < 2}
        error={error}
        emptyText="Not enough price history to chart yet."
        skeletonVariant="area"
        ariaLabel="Implied probability over time"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="probFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C1} stopOpacity={0.28} />
                <stop offset="100%" stopColor={C1} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtX} minTickGap={48} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "oklch(1 0 0 / 25%)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof rows)[number];
                return (
                  <ChartTooltipFrame
                    title={format(new Date(p.t), "MMM d, yyyy HH:mm")}
                    rows={[
                      { label: "Implied probability", value: `${p.close.toFixed(1)}%`, color: C1 },
                      ...(p.bid != null && p.ask != null ? [{ label: "Bid / Ask", value: `${p.bid.toFixed(0)}¢ / ${p.ask.toFixed(0)}¢` }] : []),
                      ...(p.volume != null ? [{ label: "Volume", value: Math.round(p.volume).toLocaleString() }] : []),
                    ]}
                  />
                );
              }}
            />
            {marker && <ReferenceLine y={marker.value * 100} stroke="var(--chart-7)" strokeWidth={1.5} label={{ value: marker.label, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
            <Area type="monotone" dataKey="close" stroke={C1} strokeWidth={2} fill="url(#probFill)" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>

      {hasVolume && (
        <div>
          <div style={{ height: 56 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* left margin matches the price chart's y-axis width so the two share an x scale */}
              <BarChart data={rows} margin={{ top: 0, right: 8, left: 44, bottom: 0 }} barCategoryGap={2}>
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
                <YAxis hide />
                <Bar dataKey="volume" fill={C1} fillOpacity={0.35} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Volume per period</div>
        </div>
      )}
    </div>
  );
}
