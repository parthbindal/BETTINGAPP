"use client";

import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ImpliedProbabilityCalculator, ExpectedValueCalculator } from "@/components/tools/calculators";
import { normalCdf, wilsonInterval, kellyFraction } from "@/lib/analytics/probability";
import { brierScore } from "@/lib/analytics/stats";
import { pct } from "@/lib/format";
import type { Lesson } from "@/content/academy";

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="tabular font-medium">{value}</span></div>;
}

function Variance() {
  const [sd, setSd] = useState(5);
  const mean = 24;
  const line = 24.5;
  const pOver = 1 - normalCdf((line - mean) / sd);
  const p30 = 1 - normalCdf((30 - mean) / sd);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">A player averages 24 points. Drag the standard deviation and watch the probability of clearing 24.5 (and 30) change.</p>
      <div className="flex items-center justify-between text-xs"><span>Standard deviation</span><span className="tabular font-semibold">{sd}</span></div>
      <Slider value={[sd]} min={1} max={12} step={0.5} onValueChange={(v) => setSd(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="P(points > 24.5)" value={pct(pOver, 0)} />
      <Row label="P(points > 30)" value={pct(p30, 0)} />
      <p className="text-xs text-muted-foreground">Near the mean the single-game outcome is a coin flip regardless of consistency. Spread matters for lines far from the mean.</p>
    </div>
  );
}

function SampleSize() {
  const [n, setN] = useState(10);
  const rate = 0.7;
  const hits = Math.round(n * rate);
  const w = wilsonInterval(hits, n);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">A 70% hit rate. How much should you trust it? Drag the number of games.</p>
      <div className="flex items-center justify-between text-xs"><span>Games</span><span className="tabular font-semibold">{n} ({hits} hits)</span></div>
      <Slider value={[n]} min={5} max={200} step={5} onValueChange={(v) => setN(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="95% interval for the true rate" value={`${pct(w.low, 0)} – ${pct(w.high, 0)}`} />
      <div className="relative h-2 rounded-full bg-surface-3"><div className="absolute inset-y-0 rounded-full bg-chart-1/50" style={{ left: `${w.low * 100}%`, width: `${(w.high - w.low) * 100}%` }} /><div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-chart-1" style={{ left: `${rate * 100}%` }} /></div>
    </div>
  );
}

function Calibration() {
  const [conf, setConf] = useState(80);
  const trueRate = 0.65;
  const n = 100;
  const forecasts = Array(n).fill(conf / 100) as number[];
  const outcomes = Array.from({ length: n }, (_, i) => i < Math.round(n * trueRate));
  const brier = brierScore(forecasts, outcomes);
  const brierHonest = brierScore(Array(n).fill(trueRate) as number[], outcomes);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Events actually happen 65% of the time. Drag the probability you report and watch the Brier score punish overconfidence.</p>
      <div className="flex items-center justify-between text-xs"><span>Your reported probability</span><span className="tabular font-semibold">{conf}%</span></div>
      <Slider value={[conf]} min={5} max={95} step={1} onValueChange={(v) => setConf(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="Your Brier score" value={brier.toFixed(3)} />
      <Row label="Brier if you reported 65%" value={brierHonest.toFixed(3)} />
      <Row label="Always 50%" value={"0.250"} />
    </div>
  );
}

/** Deterministic linear congruential generator so the lesson shows the same paths for the same inputs. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function simulateBankroll(hitPct: number, stakePct: number) {
  const rnd = lcg(42);
  const paths = 2000;
  const steps = 100;
  let ruin = 0;
  let ddSum = 0;
  const finals: number[] = [];
  for (let p = 0; p < paths; p++) {
    let b = 100;
    let peak = 100;
    let maxDd = 0;
    for (let s = 0; s < steps; s++) {
      const bet = b * (stakePct / 100);
      b += rnd() < hitPct / 100 ? bet : -bet;
      peak = Math.max(peak, b);
      maxDd = Math.max(maxDd, (peak - b) / peak);
      if (b < 10) {
        ruin++;
        break;
      }
    }
    finals.push(b);
    ddSum += maxDd;
  }
  finals.sort((a, b) => a - b);
  return { median: finals[Math.floor(paths / 2)]!, p5: finals[Math.floor(paths * 0.05)]!, ruin: ruin / paths, avgDd: ddSum / paths };
}

function MonteCarlo() {
  const [hit, setHit] = useState(55);
  const [stake, setStake] = useState(5);
  const sim = useMemo(() => simulateBankroll(hit, stake), [hit, stake]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">2,000 simulated sequences of 100 even-money decisions starting from 100 units. Ruin = dropping below 10.</p>
      <div className="flex items-center justify-between text-xs"><span>Hit rate</span><span className="tabular font-semibold">{hit}%</span></div>
      <Slider value={[hit]} min={45} max={65} step={1} onValueChange={(v) => setHit(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <div className="flex items-center justify-between text-xs"><span>Stake per decision (% of bankroll)</span><span className="tabular font-semibold">{stake}%</span></div>
      <Slider value={[stake]} min={1} max={40} step={1} onValueChange={(v) => setStake(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="Median final bankroll" value={sim.median.toFixed(0)} />
      <Row label="5th percentile" value={sim.p5.toFixed(0)} />
      <Row label="Risk of ruin" value={pct(sim.ruin, 1)} />
      <Row label="Average max drawdown" value={pct(sim.avgDd, 0)} />
    </div>
  );
}

function Kelly() {
  const [q, setQ] = useState(55);
  const [odds, setOdds] = useState(2);
  const k = kellyFraction(q / 100, odds);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs"><span>Your probability</span><span className="tabular font-semibold">{q}%</span></div>
      <Slider value={[q]} min={30} max={80} step={1} onValueChange={(v) => setQ(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <div className="flex items-center justify-between text-xs"><span>Decimal odds</span><span className="tabular font-semibold">{odds.toFixed(2)}</span></div>
      <Slider value={[odds]} min={1.2} max={5} step={0.05} onValueChange={(v) => setOdds(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="Full Kelly fraction" value={pct(k, 1)} />
      <Row label="Half Kelly" value={pct(k / 2, 1)} />
      <Row label="Quarter Kelly" value={pct(k / 4, 1)} />
      <p className="text-xs text-muted-foreground">If your probability is overstated by 5 points, re-run the slider: full Kelly often flips to a losing strategy.</p>
    </div>
  );
}

function Bayes() {
  const [prior, setPrior] = useState(40);
  const [lr, setLr] = useState(3);
  const priorOdds = prior / (100 - prior);
  const post = (priorOdds * lr) / (1 + priorOdds * lr);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs"><span>Prior probability</span><span className="tabular font-semibold">{prior}%</span></div>
      <Slider value={[prior]} min={1} max={99} step={1} onValueChange={(v) => setPrior(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <div className="flex items-center justify-between text-xs"><span>Likelihood ratio of the new evidence</span><span className="tabular font-semibold">{lr.toFixed(1)}×</span></div>
      <Slider value={[lr]} min={0.1} max={10} step={0.1} onValueChange={(v) => setLr(Array.isArray(v) ? (v[0] as number) : (v as number))} />
      <Row label="Posterior probability" value={pct(post, 1)} />
      <p className="text-xs text-muted-foreground">Posterior odds = prior odds × likelihood ratio. Compare the size of a market&apos;s jump after news with your own update.</p>
    </div>
  );
}

export function LessonInteractive({ kind }: { kind: NonNullable<Lesson["interactive"]> }) {
  switch (kind) {
    case "implied-probability":
      return <ImpliedProbabilityCalculator />;
    case "expected-value":
      return <ExpectedValueCalculator />;
    case "variance":
      return <Variance />;
    case "sample-size":
      return <SampleSize />;
    case "calibration":
      return <Calibration />;
    case "monte-carlo":
      return <MonteCarlo />;
    case "kelly":
      return <Kelly />;
    case "bayes":
      return <Bayes />;
  }
}
