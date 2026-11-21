"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Bar, BarChart } from "recharts";
import { format } from "date-fns";
import { ChartTooltipFrame } from "./chart-tooltip";

export interface HistoryPoint {
  ts: number; // unix seconds
  close: number | null;
  bid?: number | null;
  ask?: number | null;
  volume?: number;
}

const C1 = "var(--chart-1)";

export function ProbabilityHistoryChart({ data, period, marker, height = 260, showVolume = true }: { data: HistoryPoint[]; period: "hourly" | "daily"; marker?: { value: number; label: string } | null; height?: number; showVolume?: boolean }) {
  const rows = data.filter((d) => d.close !== null).map((d) => ({ ...d, t: d.ts * 1000, close: (d.close ?? 0) * 100, bid: d.bid != null ? d.bid * 100 : undefined, ask: d.ask != null ? d.ask * 100 : undefined }));
  if (rows.length < 2) {
    return <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Not enough price history to chart yet.</div>;
  }
  const fmtX = (t: number) => format(new Date(t), period === "hourly" ? "MMM d HH:mm" : "MMM d");
  return (
    <div className="space-y-1">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
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
      </div>
      {showVolume && rows.some((r) => (r.volume ?? 0) > 0) && (
        <div style={{ height: 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 0, right: 8, left: -18, bottom: 0 }} barCategoryGap={2}>
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
              <YAxis hide />
              <Bar dataKey="volume" fill={C1} fillOpacity={0.35} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Volume per period</div>
        </div>
      )}
    </div>
  );
}
