"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { americanToProb, decimalToProb, fractionalToProb, probToAmerican, probToDecimal, contractExpectedValue, approxKalshiFeePerContract, wagerExpectedValue, removeVig, wilsonInterval, americanToDecimal } from "@/lib/analytics/probability";
import { brierScore, logLoss } from "@/lib/analytics/stats";
import { pct, cents } from "@/lib/format";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Result({ rows, note }: { rows: Array<{ label: string; value: string; emphasis?: boolean }>; note?: string }) {
  return (
    <div className="card-surface p-4">
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className={r.emphasis ? "tabular text-xl font-semibold" : "tabular text-sm font-medium"}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

export function UpsellNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Inside EDGEWISE these calculations run automatically on live markets with fees, spread and model confidence attached.{" "}
      <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">Create a free account</Link>.
    </p>
  );
}

export function ImpliedProbabilityCalculator() {
  const [format, setFormat] = useState<"american" | "decimal" | "fractional" | "price">("american");
  const [a, setA] = useState("-150");
  const [b, setB] = useState("1");
  const p = useMemo(() => {
    const x = Number(a);
    if (format === "american") return americanToProb(x);
    if (format === "decimal") return decimalToProb(x);
    if (format === "fractional") return fractionalToProb(x, Number(b));
    return x / 100;
  }, [format, a, b]);
  const valid = Number.isFinite(p) && p > 0 && p < 1;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="h-9 w-full rounded-lg border border-input bg-surface-2/40 px-3 text-sm">
            <option value="american">American odds (−150, +200)</option>
            <option value="decimal">Decimal odds (2.50)</option>
            <option value="fractional">Fractional odds (3/2)</option>
            <option value="price">Contract price in cents (62)</option>
          </select>
        </Field>
        {format === "fractional" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Numerator"><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
            <Field label="Denominator"><Input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
          </div>
        ) : (
          <Field label="Value"><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        )}
      </div>
      <Result
        rows={valid ? [
          { label: "Implied probability", value: pct(p, 1), emphasis: true },
          { label: "American", value: String(probToAmerican(p)) },
          { label: "Decimal", value: probToDecimal(p).toFixed(3) },
          { label: "Fair price (contract)", value: cents(p) },
        ] : [{ label: "Implied probability", value: "—", emphasis: true }]}
        note="Implied probability includes any bookmaker margin or exchange spread. Compare all outcomes and remove the vig for a fair probability."
      />
    </div>
  );
}

export function ExpectedValueCalculator() {
  const [mode, setMode] = useState<"contract" | "wager">("contract");
  const [prob, setProb] = useState("55");
  const [price, setPrice] = useState("48");
  const [odds, setOdds] = useState("-110");
  const [stake, setStake] = useState("100");
  const [fee, setFee] = useState(true);
  const q = Number(prob) / 100;
  const res = useMemo(() => {
    if (!(q > 0 && q < 1)) return null;
    if (mode === "contract") {
      const pr = Number(price) / 100;
      if (!(pr > 0 && pr < 1)) return null;
      const f = fee ? approxKalshiFeePerContract(pr) : 0;
      const r = contractExpectedValue(q, pr, f);
      return { rows: [
        { label: "EV per $1 contract", value: `${r.ev >= 0 ? "+" : ""}${(r.ev * 100).toFixed(1)}¢`, emphasis: true },
        { label: "EV as % of cost", value: `${(r.evPercent * 100).toFixed(1)}%` },
        { label: "Approx. fee", value: cents(f) },
        { label: "Break-even probability", value: pct(r.breakEvenProb, 1) },
      ] };
    }
    const dec = americanToDecimal(Number(odds));
    const s = Number(stake);
    if (!(dec > 1) || !(s > 0)) return null;
    const r = wagerExpectedValue(q, dec, s);
    return { rows: [
      { label: `EV on $${s}`, value: `${r.ev >= 0 ? "+" : ""}$${r.ev.toFixed(2)}`, emphasis: true },
      { label: "EV as % of stake", value: `${(r.evPercent * 100).toFixed(1)}%` },
      { label: "Implied probability of odds", value: pct(1 / dec, 1) },
      { label: "Your edge vs implied", value: `${((q - 1 / dec) * 100).toFixed(1)} pts` },
    ] };
  }, [mode, q, price, odds, stake, fee]);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Type">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="h-9 w-full rounded-lg border border-input bg-surface-2/40 px-3 text-sm">
            <option value="contract">Prediction market contract ($1 payout)</option>
            <option value="wager">Wager at American odds</option>
          </select>
        </Field>
        <Field label="Your probability estimate (%)" hint="Be honest: this is the input everything depends on."><Input inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)} /></Field>
        {mode === "contract" ? (
          <>
            <Field label="Contract price (cents)"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fee} onChange={(e) => setFee(e.target.checked)} className="accent-primary" /> Include approximate Kalshi taker fee</label>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="American odds"><Input inputMode="decimal" value={odds} onChange={(e) => setOdds(e.target.value)} /></Field>
            <Field label="Stake ($)"><Input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} /></Field>
          </div>
        )}
      </div>
      <Result rows={res?.rows ?? [{ label: "EV", value: "—", emphasis: true }]} note="EV = probability × payout − cost − fees. A positive EV is only as reliable as your probability estimate. Stress-test it at the low end of your confidence range." />
    </div>
  );
}

export function OddsConverter() {
  const [american, setAmerican] = useState("+150");
  const p = americanToProb(Number(american));
  const valid = Number.isFinite(p) && p > 0 && p < 1;
  const [outcomes, setOutcomes] = useState("-110, -110");
  const vig = useMemo(() => {
    const ps = outcomes.split(",").map((s) => americanToProb(Number(s.trim()))).filter((x) => Number.isFinite(x));
    if (ps.length < 2) return null;
    return { ...removeVig(ps), raw: ps };
  }, [outcomes]);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="American odds"><Input value={american} onChange={(e) => setAmerican(e.target.value)} /></Field>
        <Result rows={valid ? [
          { label: "Decimal", value: probToDecimal(p).toFixed(3), emphasis: true },
          { label: "Implied probability", value: pct(p, 2) },
          { label: "Fractional (approx.)", value: `${(probToDecimal(p) - 1).toFixed(2)}/1` },
        ] : [{ label: "Decimal", value: "—", emphasis: true }]} />
      </div>
      <div className="space-y-4">
        <Field label="Remove the vig: all outcomes' American odds, comma-separated" hint="Example: -110, -110 or +150, -120, +400"><Input value={outcomes} onChange={(e) => setOutcomes(e.target.value)} /></Field>
        <Result rows={vig ? [
          { label: "Overround (vig)", value: pct(vig.overround, 2), emphasis: true },
          ...vig.fair.map((f, i) => ({ label: `Outcome ${i + 1} fair probability`, value: `${pct(vig.raw[i]!, 1)} → ${pct(f, 1)}` })),
        ] : [{ label: "Overround", value: "—", emphasis: true }]} note="Fair probabilities divide each implied probability by the total so they sum to 100%." />
      </div>
    </div>
  );
}

export function ProbabilityComparisonTool() {
  const [market, setMarket] = useState("60");
  const [est, setEst] = useState("68");
  const [spread, setSpread] = useState("2");
  const [conf, setConf] = useState("8");
  const m = Number(market) / 100;
  const e = Number(est) / 100;
  const s = Number(spread) / 100;
  const band = Number(conf) / 100;
  const valid = m > 0 && m < 1 && e > 0 && e < 1;
  const diff = e - m;
  const fee = valid ? approxKalshiFeePerContract(m) : 0;
  const survives = valid ? Math.abs(diff) - s / 2 - fee : 0;
  const robust = valid ? (diff > 0 ? e - band - (m + s / 2) - fee : m - s / 2 - (e + band) - fee) : 0;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Market implied (%)"><Input value={market} onChange={(e) => setMarket(e.target.value)} /></Field>
        <Field label="Your / model estimate (%)"><Input value={est} onChange={(e) => setEst(e.target.value)} /></Field>
        <Field label="Bid–ask spread (¢)"><Input value={spread} onChange={(e) => setSpread(e.target.value)} /></Field>
        <Field label="Estimate uncertainty (± pts)" hint="How wrong could your estimate plausibly be?"><Input value={conf} onChange={(e) => setConf(e.target.value)} /></Field>
      </div>
      <Result rows={valid ? [
        { label: "Raw difference", value: `${(diff * 100).toFixed(1)} pts`, emphasis: true },
        { label: "Approx. fee at market price", value: cents(fee) },
        { label: "Gap after half-spread and fee", value: `${(survives * 100).toFixed(1)} pts` },
        { label: "Gap at the pessimistic end of your estimate", value: `${(robust * 100).toFixed(1)} pts` },
        { label: "Verdict", value: robust > 0 ? "Worth researching" : "Within noise" },
      ] : [{ label: "Raw difference", value: "—", emphasis: true }]} note="A difference that disappears at the low end of your confidence range is not an edge; it is uncertainty. This tool does not know anything about the event." />
    </div>
  );
}

export function HistoricalPerformanceCalculator() {
  const [rows, setRows] = useState("70,1\n60,1\n55,0\n80,1\n30,0\n65,0\n75,1\n50,1");
  const parsed = useMemo(() => {
    const lines = rows.split(/\n+/).map((l) => l.split(",").map((x) => x.trim())).filter((l) => l.length >= 2 && l[0] !== "");
    const f = lines.map((l) => Number(l[0]) / 100);
    const o = lines.map((l) => l[1] === "1" || /^y/i.test(l[1] ?? ""));
    if (!f.length || f.some((x) => !(x >= 0 && x <= 1))) return null;
    const hits = f.filter((x, i) => (x >= 0.5) === o[i]).length;
    const w = wilsonInterval(hits, f.length);
    return { n: f.length, acc: hits / f.length, brier: brierScore(f, o), ll: logLoss(f, o), w };
  }, [rows]);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="One prediction per line: probability (%), outcome (1 = happened, 0 = did not)">
        <textarea value={rows} onChange={(e) => setRows(e.target.value)} rows={9} className="w-full rounded-lg border border-input bg-surface-2/40 px-3 py-2 font-mono text-xs" />
      </Field>
      <Result rows={parsed ? [
        { label: "Brier score (lower is better; 0.25 = always 50%)", value: parsed.brier.toFixed(3), emphasis: true },
        { label: "Log loss", value: parsed.ll.toFixed(3) },
        { label: "Directional accuracy", value: pct(parsed.acc, 0) },
        { label: "Accuracy 95% interval", value: `${pct(parsed.w.low, 0)} – ${pct(parsed.w.high, 0)}` },
        { label: "Sample size", value: String(parsed.n) },
      ] : [{ label: "Brier score", value: "—", emphasis: true }]} note="Inside EDGEWISE, predictions are locked at the time you make them and scored automatically against market resolution, so results cannot be edited after the fact." />
    </div>
  );
}
