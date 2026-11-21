"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { ChartTooltipFrame } from "./chart-tooltip";

export function CalibrationChart({ bins, height = 240 }: { bins: Array<{ meanForecast: number; observed: number; n: number }>; height?: number }) {
  if (!bins.length) return <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Resolve at least a few predictions to see calibration.</div>;
  const rows = bins.map((b) => ({ x: b.meanForecast * 100, y: b.observed * 100, n: b.n }));
  const diag = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ];
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid />
          <XAxis dataKey="x" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} label={{ value: "Forecast", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis dataKey="y" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload.find((x) => (x.payload as { n?: number }).n !== undefined)?.payload as (typeof rows)[number] | undefined;
              if (!p) return null;
              return <ChartTooltipFrame rows={[{ label: "Mean forecast", value: `${p.x.toFixed(0)}%` }, { label: "Observed", value: `${p.y.toFixed(0)}%` }, { label: "Predictions", value: p.n }]} />;
            }}
          />
          <Line data={diag} dataKey="y" stroke="oklch(1 0 0 / 25%)" strokeWidth={1} dot={false} isAnimationActive={false} />
          <Scatter data={rows} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineChartSimple({ data, height = 200, yLabel, yDomain, digits = 3 }: { data: Array<{ x: string; y: number }>; height?: number; yLabel?: string; yDomain?: [number, number]; digits?: number }) {
  if (data.length < 2) return <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Not enough data yet.</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis domain={yDomain ?? ["auto", "auto"]} allowDecimals={digits > 0} tickLine={false} axisLine={false} />
          <Tooltip content={({ active, payload }) => (active && payload?.length ? <ChartTooltipFrame title={(payload[0]!.payload as { x: string }).x} rows={[{ label: yLabel ?? "Value", value: Number(payload[0]!.value).toFixed(digits) }]} /> : null)} />
          <Line type="monotone" dataKey="y" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
