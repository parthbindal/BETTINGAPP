/**
 * Pure probability and odds utilities. No I/O, fully unit-testable.
 * Conventions: probabilities are 0..1; prices are dollars 0..1 (Kalshi style).
 */

export function clamp01(p: number): number {
  return Math.min(1, Math.max(0, p));
}

/** American odds -> implied probability (includes the vig). */
export function americanToProb(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return NaN;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

export function probToAmerican(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

export function decimalToProb(decimal: number): number {
  if (decimal <= 1) return NaN;
  return 1 / decimal;
}

export function probToDecimal(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  return 1 / p;
}

export function fractionalToProb(num: number, den: number): number {
  if (den <= 0 || num < 0) return NaN;
  return den / (num + den);
}

export function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / -odds + 1;
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return NaN;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** Remove the bookmaker margin proportionally so a set of outcome probabilities sums to 1. */
export function removeVig(impliedProbs: number[]): { fair: number[]; overround: number } {
  const total = impliedProbs.reduce((a, b) => a + b, 0);
  if (total <= 0) return { fair: impliedProbs.map(() => NaN), overround: NaN };
  return { fair: impliedProbs.map((p) => p / total), overround: total - 1 };
}

/**
 * Expected value of a binary contract bought at `price` (0..1) that pays $1
 * if it resolves YES, given a probability estimate `p`. Fees are optional and
 * expressed per contract in dollars.
 */
export function contractExpectedValue(p: number, price: number, feePerContract = 0): {
  ev: number;
  evPercent: number;
  breakEvenProb: number;
} {
  const cost = price + feePerContract;
  const ev = p * 1 - cost;
  return { ev, evPercent: cost > 0 ? ev / cost : NaN, breakEvenProb: cost };
}

/**
 * Approximate Kalshi taker fee per contract: 0.07 × P × (1 − P), rounded up to
 * the cent. Kalshi publishes fee schedules per series; treat this as an
 * approximation and check the contract's own fee schedule.
 */
export function approxKalshiFeePerContract(price: number): number {
  const raw = 0.07 * price * (1 - price);
  return Math.ceil(raw * 100) / 100;
}

/** Expected value for a generic wager with decimal odds. */
export function wagerExpectedValue(p: number, decimalOdds: number, stake: number): { ev: number; evPercent: number } {
  const profit = stake * (decimalOdds - 1);
  const ev = p * profit - (1 - p) * stake;
  return { ev, evPercent: stake > 0 ? ev / stake : NaN };
}

/** Kelly fraction for a binary outcome (for education; not a recommendation). */
export function kellyFraction(p: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  return Math.max(0, (p * b - (1 - p)) / b);
}

/** Standard normal CDF via Abramowitz–Stegun approximation. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Probability a normal(mu, sigma) exceeds threshold x. */
export function probOver(mu: number, sigma: number, x: number): number {
  if (sigma <= 0) return mu > x ? 1 : 0;
  return 1 - normalCdf((x - mu) / sigma);
}

/** Wilson score interval for a proportion. */
export function wilsonInterval(hits: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const phat = hits / n;
  const denom = 1 + (z * z) / n;
  const center = (phat + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: clamp01(center - half), high: clamp01(center + half) };
}

/** Shrink an empirical frequency toward a prior; k is the prior's pseudo-count. */
export function shrunkFrequency(hits: number, n: number, prior: number, k = 10): number {
  return (hits + prior * k) / (n + k);
}
