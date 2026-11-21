/**
 * EDGEWISE heuristic market model — version calib-v0.1.
 *
 * This is NOT a prediction of truth. It is a transparent, rule-based estimate
 * that combines (a) the current mid price, (b) a mild favorite–longshot
 * calibration prior documented in prediction-market research, and (c) the
 * recent trading-mean as an anchor against thin-market noise. The output is
 * meant to prompt research, not to be traded on. Confidence is driven by
 * liquidity, spread, and history depth.
 */
import type { Candle, NormalizedMarket } from "@/lib/data/types";
import { impliedProbability, spread as bookSpread } from "@/lib/data/types";
import { approxKalshiFeePerContract, clamp01 } from "@/lib/analytics/probability";
import { mean, stdev } from "@/lib/analytics/stats";

export const MODEL_VERSION = "calib-v0.1";

export type Confidence = "low" | "medium" | "high";

export interface MarketModelResult {
  modelVersion: string;
  marketProb: number | null; // mid price (implied probability)
  estimate: number | null; // model estimate
  diffPts: number | null; // estimate - market, in probability points
  confidence: Confidence;
  noteworthy: boolean;
  netOfFeesDiff: number | null; // diff after approximate taker fee
  inputs: {
    mid: number | null;
    last: number | null;
    spread: number | null;
    volume24h: number;
    openInterest: number;
    recentMean: number | null;
    recentVolatility: number | null;
    candleCount: number;
    hoursToClose: number | null;
    calibrationGamma: number;
    priceWeight: number;
  };
  explanation: string[];
  caveats: string[];
}

function logit(p: number) {
  return Math.log(p / (1 - p));
}
function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function runMarketModel(market: NormalizedMarket, candles: Candle[]): MarketModelResult {
  const mid = impliedProbability(market);
  const spread = bookSpread(market);
  const closes = candles.map((c) => c.close).filter((x): x is number => x !== null);
  const recent = closes.slice(-7);
  const recentMean = recent.length >= 3 ? mean(recent) : null;
  const recentVolatility = recent.length >= 3 ? stdev(recent) : null;
  const hoursToClose = market.closeTime ? (new Date(market.closeTime).getTime() - Date.now()) / 3600_000 : null;

  const explanation: string[] = [];
  const caveats: string[] = [];

  if (mid === null) {
    return {
      modelVersion: MODEL_VERSION,
      marketProb: null,
      estimate: null,
      diffPts: null,
      confidence: "low",
      noteworthy: false,
      netOfFeesDiff: null,
      inputs: { mid, last: market.lastPrice, spread, volume24h: market.volume24h, openInterest: market.openInterest, recentMean, recentVolatility, candleCount: candles.length, hoursToClose, calibrationGamma: 1, priceWeight: 1 },
      explanation: ["No two-sided quote or last trade is available, so no implied probability can be computed."],
      caveats: ["Without a price there is nothing to compare against."],
    };
  }

  // (b) favorite–longshot prior: a gentle stretch in logit space.
  const gamma = 1.08;
  const p = Math.min(0.995, Math.max(0.005, mid));
  const calibrated = sigmoid(logit(p) * gamma);
  explanation.push(
    `Market mid price is ${(mid * 100).toFixed(1)}¢, i.e. an implied probability of ${(mid * 100).toFixed(1)}%. Prediction-market research finds low-probability contracts tend to trade slightly rich and high-probability contracts slightly cheap, so the model applies a mild calibration adjustment (γ=${gamma}) giving ${(calibrated * 100).toFixed(1)}%.`,
  );

  // (c) recent-mean anchor, weighted by liquidity.
  let priceWeight = 0.6;
  if (market.volume24h >= 20_000) priceWeight = 0.9;
  else if (market.volume24h >= 5_000) priceWeight = 0.8;
  else if (market.volume24h >= 500) priceWeight = 0.7;
  let estimate = calibrated;
  if (recentMean !== null) {
    estimate = priceWeight * calibrated + (1 - priceWeight) * recentMean;
    explanation.push(
      `The 7-period trading mean is ${(recentMean * 100).toFixed(1)}%. With 24h volume of ${Math.round(market.volume24h).toLocaleString()} contracts the model trusts the current price at weight ${priceWeight.toFixed(2)} and the recent mean at ${(1 - priceWeight).toFixed(2)}.`,
    );
  } else {
    caveats.push("Fewer than 3 historical candles were available, so no recent-mean anchor was applied.");
  }
  estimate = clamp01(estimate);
  const diff = estimate - mid;

  // Confidence from microstructure.
  let confidence: Confidence = "low";
  if (spread !== null && spread <= 0.02 && market.volume24h >= 5_000 && candles.length >= 5) confidence = "high";
  else if (spread !== null && spread <= 0.05 && market.volume24h >= 500 && candles.length >= 3) confidence = "medium";
  if (spread === null) caveats.push("One-sided or empty order book: the implied probability is based on the last trade only.");
  else if (spread > 0.05) caveats.push(`Wide bid–ask spread (${(spread * 100).toFixed(0)}¢) means the true market view is uncertain within that range.`);
  if (market.volume24h < 500) caveats.push("Low 24h volume: prices in thin markets move on small orders and may not reflect broad consensus.");
  if (hoursToClose !== null && hoursToClose < 6) caveats.push("The market closes within hours; late price moves often reflect new information rather than mispricing.");
  if (recentVolatility !== null && recentVolatility > 0.08) caveats.push("Recent prices have been volatile, which lowers the reliability of any single snapshot.");

  const fee = approxKalshiFeePerContract(mid);
  const netOfFeesDiff = Math.abs(diff) - fee > 0 ? Math.sign(diff) * (Math.abs(diff) - fee) : 0;
  const threshold = Math.max(spread ?? 0.02, 0.03);
  const noteworthy = Math.abs(diff) > threshold && confidence !== "low" && Math.abs(netOfFeesDiff) > 0.005;

  explanation.push(
    `Model estimate ${(estimate * 100).toFixed(1)}% vs market ${(mid * 100).toFixed(1)}%: a difference of ${(diff * 100).toFixed(1)} points. Approximate taker fee at this price is ${(fee * 100).toFixed(0)}¢ per contract, leaving ${(netOfFeesDiff * 100).toFixed(1)} points after fees.`,
  );
  caveats.push("This is a heuristic estimate, not an independent forecast of the real-world event. A gap is a prompt to research the resolution criteria and news, not evidence of a profitable opportunity.");

  return {
    modelVersion: MODEL_VERSION,
    marketProb: mid,
    estimate,
    diffPts: diff,
    confidence,
    noteworthy,
    netOfFeesDiff,
    inputs: { mid, last: market.lastPrice, spread, volume24h: market.volume24h, openInterest: market.openInterest, recentMean, recentVolatility, candleCount: candles.length, hoursToClose, calibrationGamma: gamma, priceWeight },
    explanation,
    caveats,
  };
}

/** Summarize price movement from candles for the history view. */
export function summarizeMovement(candles: Candle[]) {
  const closes = candles.map((c) => c.close).filter((x): x is number => x !== null);
  if (closes.length < 2) return null;
  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  let maxMove = 0;
  let maxMoveIdx = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (Math.abs(d) > Math.abs(maxMove)) {
      maxMove = d;
      maxMoveIdx = i;
    }
  }
  return {
    first,
    last,
    change: last - first,
    high: Math.max(...closes),
    low: Math.min(...closes),
    volatility: stdev(closes),
    biggestMove: { delta: maxMove, ts: candles[maxMoveIdx]?.ts ?? null },
    totalVolume: candles.reduce((a, c) => a + c.volume, 0),
  };
}
