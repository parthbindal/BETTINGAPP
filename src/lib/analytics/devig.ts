/**
 * Devigging engine. Converts the prices of a market's mutually-exclusive
 * outcomes into fair probabilities by removing the margin ("vig" / overround).
 *
 * Three documented methods, so an analyst can compare rather than trust one:
 *   - proportional: divide each raw implied probability by their sum.
 *   - power:        find k such that sum(p_i^k) = 1 (favourite-longshot aware).
 *   - shin:         Shin (1992/1993) insider-trading model, 2-outcome form.
 *
 * All functions are pure. Inputs are raw implied probabilities in (0,1) — use
 * the odds helpers in probability.ts to get those from American/decimal odds
 * or from a prediction-market price (price == implied probability).
 */
import { clamp01 } from "@/lib/analytics/probability";

export type DevigMethod = "proportional" | "power" | "shin";

export interface DevigResult {
  method: DevigMethod;
  fair: number[]; // fair probabilities, sum to 1
  overround: number; // sum(raw) - 1 (the bookmaker margin as a fraction)
  /** Shin only: estimated share of informed ("insider") money, 0..~0.2. */
  insiderShare?: number;
  converged: boolean;
}

export function overround(raw: number[]): number {
  return raw.reduce((a, b) => a + b, 0) - 1;
}

/** The simplest de-vig: scale so the probabilities sum to one. */
export function devigProportional(raw: number[]): DevigResult {
  const total = raw.reduce((a, b) => a + b, 0);
  return { method: "proportional", fair: total > 0 ? raw.map((p) => p / total) : raw.map(() => NaN), overround: total - 1, converged: total > 0 };
}

/**
 * Power method: solve sum(p_i^k) = 1 for k by bisection, then fair_i = p_i^k.
 * k > 1 compresses favourites and lengthens longshots (corrects the
 * favourite-longshot bias) when the book has margin.
 */
export function devigPower(raw: number[]): DevigResult {
  const ps = raw.filter((p) => p > 0 && p < 1);
  if (ps.length !== raw.length) return { ...devigProportional(raw), method: "power" };
  const f = (k: number) => raw.reduce((a, p) => a + Math.pow(p, k), 0) - 1;
  let lo = 0.2;
  let hi = 5;
  // Ensure a sign change brackets the root; margin>0 means f(1)>0 so k>1.
  if (f(lo) * f(hi) > 0) return { ...devigProportional(raw), method: "power", converged: false };
  let k = 1;
  let converged = false;
  for (let i = 0; i < 80; i++) {
    k = (lo + hi) / 2;
    const v = f(k);
    if (Math.abs(v) < 1e-10) {
      converged = true;
      break;
    }
    if (f(lo) * v < 0) hi = k;
    else lo = k;
  }
  const fair = raw.map((p) => Math.pow(p, k));
  const s = fair.reduce((a, b) => a + b, 0);
  return { method: "power", fair: fair.map((p) => p / s), overround: overround(raw), converged };
}

/**
 * Shin method (two-outcome). Models the margin as arising from a proportion z
 * of informed traders, and backs out the fair probabilities. Reduces to
 * proportional when z -> 0. Reference: H.S. Shin, Economic Journal, 1992.
 */
export function devigShin(raw: [number, number]): DevigResult {
  const [a, b] = raw;
  const sum = a + b;
  if (!(a > 0 && b > 0) || sum <= 1) {
    return { ...devigProportional(raw), method: "shin", insiderShare: 0 };
  }
  // Closed-form z for the two-outcome case.
  const inside = sum * sum - 4 * ((sum - 1) / sum) * a * b * (4 / sum);
  // Robust numeric solve instead of the fragile closed form: find z in [0,0.3]
  // such that the implied probabilities sum to 1.
  const prob = (p: number, z: number) => (Math.sqrt(z * z + 4 * (1 - z) * (p * p) / sum) - z) / (2 * (1 - z));
  const g = (z: number) => prob(a, z) + prob(b, z) - 1;
  let lo = 0;
  let hi = 0.35;
  let z = 0;
  let converged = false;
  if (g(lo) * g(hi) <= 0) {
    for (let i = 0; i < 80; i++) {
      z = (lo + hi) / 2;
      const v = g(z);
      if (Math.abs(v) < 1e-10) {
        converged = true;
        break;
      }
      if (g(lo) * v < 0) hi = z;
      else lo = z;
    }
  }
  const fair = [clamp01(prob(a, z)), clamp01(prob(b, z))];
  const s = fair[0]! + fair[1]!;
  void inside;
  return { method: "shin", fair: [fair[0]! / s, fair[1]! / s], overround: sum - 1, insiderShare: z, converged };
}

export function devig(raw: number[], method: DevigMethod): DevigResult {
  if (method === "power") return devigPower(raw);
  if (method === "shin" && raw.length === 2) return devigShin([raw[0]!, raw[1]!]);
  return devigProportional(raw);
}

/** All methods at once, for the comparison UI. */
export function devigAll(raw: number[]): DevigResult[] {
  const out = [devigProportional(raw), devigPower(raw)];
  if (raw.length === 2) out.push(devigShin([raw[0]!, raw[1]!]));
  return out;
}
