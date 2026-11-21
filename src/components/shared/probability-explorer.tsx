"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { contractExpectedValue, approxKalshiFeePerContract } from "@/lib/analytics/probability";
import { pct, cents } from "@/lib/format";
import Link from "next/link";

/** Interactive: drag your own estimate against a live market and see the gap, fee and EV respond. */
export function ProbabilityExplorer({ markets }: { markets: Array<{ ticker: string; title: string; yesSubTitle: string | null; prob: number; spread: number | null }> }) {
  const [idx, setIdx] = useState(0);
  const m = markets[idx];
  const [est, setEst] = useState(Math.round((m?.prob ?? 0.5) * 100));
  if (!m) return <p className="text-sm text-muted-foreground">No liquid markets available yet.</p>;
  const q = est / 100;
  const fee = approxKalshiFeePerContract(m.prob);
  const ev = contractExpectedValue(q, m.prob, fee);
  const gap = q - m.prob;
  const noise = Math.max((m.spread ?? 0.02) / 2 + fee, 0.02);
  return (
    <div className="space-y-4">
      <select
        value={idx}
        onChange={(e) => {
          const i = Number(e.target.value);
          setIdx(i);
          setEst(Math.round((markets[i]?.prob ?? 0.5) * 100));
        }}
        className="h-9 w-full rounded-lg border border-input bg-surface-2/40 px-3 text-sm"
      >
        {markets.map((x, i) => (
          <option key={x.ticker} value={i}>
            {x.title}
            {x.yesSubTitle ? ` — ${x.yesSubTitle}` : ""}
          </option>
        ))}
      </select>
      <div className="relative h-2 rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-0 rounded-full bg-chart-1/30" style={{ width: `${m.prob * 100}%` }} />
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-chart-1 ring-2 ring-card" style={{ left: `calc(${m.prob * 100}% - 1px)` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-7 ring-2 ring-card" style={{ left: `${q * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2.5 w-0.5 bg-chart-1 align-middle" />Market {pct(m.prob, 0)}</span>
        <span><span className="mr-1 inline-block size-2 rounded-full bg-chart-7 align-middle" />Your estimate {est}%</span>
      </div>
      <Slider value={[est]} min={1} max={99} step={1} onValueChange={(v) => setEst(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-surface-2/50 p-3">
          <dt className="text-[11px] text-muted-foreground">Gap</dt>
          <dd className="tabular text-lg font-semibold">{(gap * 100).toFixed(0)} pts</dd>
        </div>
        <div className="rounded-lg bg-surface-2/50 p-3">
          <dt className="text-[11px] text-muted-foreground">Approx. fee</dt>
          <dd className="tabular text-lg font-semibold">{cents(fee)}</dd>
        </div>
        <div className="rounded-lg bg-surface-2/50 p-3">
          <dt className="text-[11px] text-muted-foreground">EV per $1 (YES)</dt>
          <dd className="tabular text-lg font-semibold">{ev.ev >= 0 ? "+" : ""}{(ev.ev * 100).toFixed(1)}¢</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {Math.abs(gap) <= noise ? "Your estimate sits inside the spread-and-fee noise band: no meaningful disagreement with the market." : `Your estimate differs by more than spread and fees. That is a reason to read the rules and news for this market, not a signal to act.`}{" "}
        <Link href={`/markets/${m.ticker}`} className="text-primary hover:underline">Open market →</Link>
      </p>
    </div>
  );
}
