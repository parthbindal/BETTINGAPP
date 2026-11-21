/** Descriptive statistics and scoring rules. Pure functions. */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function stdev(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - (sample ? 1 : 0)));
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

export function hitRate(xs: number[], threshold: number, side: "over" | "under" = "over"): { hits: number; n: number; rate: number } {
  const hits = xs.filter((x) => (side === "over" ? x > threshold : x < threshold)).length;
  return { hits, n: xs.length, rate: xs.length ? hits / xs.length : NaN };
}

/** Exponentially weighted mean; alpha close to 1 weighs recent values most. */
export function ewma(xs: number[], alpha = 0.3): number {
  if (!xs.length) return NaN;
  let v = xs[0]!;
  for (let i = 1; i < xs.length; i++) v = alpha * xs[i]! + (1 - alpha) * v;
  return v;
}

export function describe(xs: number[]) {
  return {
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    stdev: stdev(xs),
    min: xs.length ? Math.min(...xs) : NaN,
    max: xs.length ? Math.max(...xs) : NaN,
    p25: percentile(xs, 0.25),
    p75: percentile(xs, 0.75),
  };
}

/** Histogram bins for a distribution chart. */
export function histogram(xs: number[], binSize: number): Array<{ from: number; to: number; count: number }> {
  if (!xs.length) return [];
  const min = Math.floor(Math.min(...xs) / binSize) * binSize;
  const max = Math.ceil((Math.max(...xs) + 0.0001) / binSize) * binSize;
  const bins: Array<{ from: number; to: number; count: number }> = [];
  for (let b = min; b < max; b += binSize) bins.push({ from: b, to: b + binSize, count: 0 });
  for (const x of xs) {
    const i = Math.min(bins.length - 1, Math.floor((x - min) / binSize));
    bins[i]!.count++;
  }
  return bins;
}

/** Brier score: mean squared error of probability forecasts (lower is better; 0.25 = always 50%). */
export function brierScore(forecasts: number[], outcomes: boolean[]): number {
  if (!forecasts.length || forecasts.length !== outcomes.length) return NaN;
  const s = forecasts.reduce((a, f, i) => a + (f - (outcomes[i] ? 1 : 0)) ** 2, 0);
  return s / forecasts.length;
}

/** Log loss with clipping to avoid infinities. */
export function logLoss(forecasts: number[], outcomes: boolean[], eps = 1e-6): number {
  if (!forecasts.length || forecasts.length !== outcomes.length) return NaN;
  const s = forecasts.reduce((a, f, i) => {
    const p = Math.min(1 - eps, Math.max(eps, f));
    return a + (outcomes[i] ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return s / forecasts.length;
}

/** Calibration bins: forecast bucket vs observed frequency. */
export function calibrationBins(forecasts: number[], outcomes: boolean[], bins = 10) {
  const out = Array.from({ length: bins }, (_, i) => ({
    bin: i,
    from: i / bins,
    to: (i + 1) / bins,
    n: 0,
    meanForecast: 0,
    observed: 0,
  }));
  forecasts.forEach((f, i) => {
    const b = Math.min(bins - 1, Math.floor(f * bins));
    const o = out[b]!;
    o.n++;
    o.meanForecast += f;
    o.observed += outcomes[i] ? 1 : 0;
  });
  return out
    .filter((o) => o.n > 0)
    .map((o) => ({ ...o, meanForecast: o.meanForecast / o.n, observed: o.observed / o.n }));
}

/** Brier skill score relative to a reference forecast (e.g. the market price). */
export function skillScore(brier: number, referenceBrier: number): number {
  if (!Number.isFinite(brier) || !Number.isFinite(referenceBrier) || referenceBrier === 0) return NaN;
  return 1 - brier / referenceBrier;
}
