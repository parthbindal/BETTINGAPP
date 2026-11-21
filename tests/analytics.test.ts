import { test } from "node:test";
import assert from "node:assert/strict";
import {
  americanToProb,
  probToAmerican,
  decimalToProb,
  probToDecimal,
  fractionalToProb,
  americanToDecimal,
  decimalToAmerican,
  removeVig,
  contractExpectedValue,
  approxKalshiFeePerContract,
  wagerExpectedValue,
  kellyFraction,
  normalCdf,
  probOver,
  wilsonInterval,
  shrunkFrequency,
} from "@/lib/analytics/probability";
import { mean, median, stdev, percentile, hitRate, histogram, brierScore, logLoss, calibrationBins, skillScore } from "@/lib/analytics/stats";
import { devigProportional, devigPower, devigShin, devig, overround } from "@/lib/analytics/devig";
import { analyzeProjection, type LogPoint } from "@/lib/analytics/projection";
import { runMarketModel, summarizeMovement } from "@/lib/analytics/market-model";
import { compareEvent } from "@/lib/analytics/line-comparison";
import type { SideComparison, VenueQuote } from "@/lib/data/cross-source";
import { impliedProbability, spread, refreshProvenance, type NormalizedMarket, type Candle } from "@/lib/data/types";
import { safeNextPath } from "@/lib/safe-redirect";
import { checkCommunityContent } from "@/lib/moderation";
import { PLANS, tierAtLeast } from "@/lib/subscriptions/plans";

const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test("odds conversions", () => {
  near(americanToProb(-150), 0.6);
  near(americanToProb(200), 1 / 3);
  assert.equal(probToAmerican(0.6), -150);
  assert.equal(probToAmerican(0.25), 300);
  near(decimalToProb(2.5), 0.4);
  near(probToDecimal(0.4), 2.5);
  near(fractionalToProb(3, 1), 0.25);
  near(americanToDecimal(-150), 1.6667);
  assert.equal(decimalToAmerican(2.5), 150);
  assert.ok(Number.isNaN(americanToProb(0)));
  assert.ok(Number.isNaN(probToAmerican(1)));
});

test("vig removal sums to one", () => {
  const { fair, overround } = removeVig([americanToProb(-110), americanToProb(-110)]);
  near(fair[0]! + fair[1]!, 1);
  near(fair[0]!, 0.5);
  near(overround, 0.0476, 1e-3);
});

test("contract expected value and fees", () => {
  const r = contractExpectedValue(0.5, 0.4);
  near(r.ev, 0.1);
  near(r.breakEvenProb, 0.4);
  near(approxKalshiFeePerContract(0.5), 0.02);
  assert.ok(approxKalshiFeePerContract(0.05) >= 0.01);
  const withFee = contractExpectedValue(0.52, 0.5, approxKalshiFeePerContract(0.5));
  near(withFee.ev, 0); // a two-point edge disappears after the fee
  near(wagerExpectedValue(0.55, 2, 100).ev, 10);
  near(kellyFraction(0.55, 2), 0.1);
  assert.equal(kellyFraction(0.4, 2), 0);
});

test("normal model and intervals", () => {
  near(normalCdf(0), 0.5);
  near(normalCdf(1.96), 0.975, 2e-3);
  near(probOver(24, 6, 30), 0.1587, 2e-3);
  const w = wilsonInterval(7, 10);
  assert.ok(w.low > 0.38 && w.low < 0.42, `low ${w.low}`);
  assert.ok(w.high > 0.87 && w.high < 0.91, `high ${w.high}`);
  const wide = wilsonInterval(7, 10);
  const narrow = wilsonInterval(70, 100);
  assert.ok(narrow.high - narrow.low < wide.high - wide.low);
  near(shrunkFrequency(7, 10, 0.5, 10), 0.6);
});

test("descriptive statistics", () => {
  const xs = [10, 20, 30, 40, 100];
  assert.equal(mean(xs), 40);
  assert.equal(median(xs), 30);
  assert.equal(percentile(xs, 0.5), 30);
  near(stdev([2, 4, 4, 4, 5, 5, 7, 9], false), 2);
  assert.deepEqual(hitRate([1, 2, 3, 4], 2.5), { hits: 2, n: 4, rate: 0.5 });
  const h = histogram([1, 2, 2, 3, 9], 2);
  assert.equal(h.reduce((a, b) => a + b.count, 0), 5);
});

test("scoring rules", () => {
  near(brierScore([0.5, 0.5, 0.5, 0.5], [true, false, true, false]), 0.25);
  assert.equal(brierScore([1, 0], [true, false]), 0);
  assert.equal(brierScore([0, 1], [true, false]), 1);
  near(logLoss([0.5], [true]), Math.log(2));
  assert.ok(logLoss([0.99], [false]) > logLoss([0.6], [false]));
  const bins = calibrationBins([0.71, 0.75, 0.78, 0.22], [true, true, false, false], 10);
  const b7 = bins.find((b) => b.bin === 7)!;
  assert.equal(b7.n, 3);
  near(b7.observed, 2 / 3);
  near(skillScore(0.2, 0.25), 0.2);
});

test("projection analysis flags small samples and stays in range", () => {
  const pts = [22, 31, 18, 27, 25, 19, 30, 24];
  const points: LogPoint[] = pts.map((v, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, value: v, minutes: 32, isHome: i % 2 === 0, opponentId: "t", opponentName: "T", opponentDefRating: 110 + i }));
  const a = analyzeProjection(points, "pts", 24.5);
  assert.equal(a.sampleSize, 8);
  assert.ok(a.estimate.probOver > 0.03 && a.estimate.probOver < 0.97);
  near(a.estimate.probOver + a.estimate.probUnder, 1);
  assert.ok(a.flags.some((f) => /Small sample/.test(f.text)));
  assert.equal(a.estimate.confidence, "low");
  assert.equal(a.windows.season.overHits, 4);
  const empty = analyzeProjection([], "pts", 10.5);
  assert.equal(empty.sampleSize, 0);
});

function market(over: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    ticker: "KXTEST-1",
    eventTicker: "KXTEST",
    seriesTicker: "KXTEST",
    title: "Test market",
    subtitle: null,
    yesSubTitle: null,
    category: "Economics",
    status: "active",
    yesBid: 0.59,
    yesAsk: 0.61,
    lastPrice: 0.6,
    previousPrice: 0.58,
    volume: 100000,
    volume24h: 25000,
    openInterest: 50000,
    openTime: null,
    closeTime: new Date(Date.now() + 30 * 86400_000).toISOString(),
    expirationTime: null,
    rulesPrimary: null,
    rulesSecondary: null,
    result: null,
    provenance: { source: "kalshi", freshness: "live", fetchedAt: new Date().toISOString() },
    ...over,
  };
}
const candles = (closes: number[]): Candle[] => closes.map((c, i) => ({ ts: 1_700_000_000 + i * 86400, open: c, high: c, low: c, close: c, mean: c, yesBidClose: c - 0.01, yesAskClose: c + 0.01, volume: 1000, openInterest: 1000 }));

test("market model: efficient liquid market is not flagged", () => {
  const m = market();
  near(impliedProbability(m)!, 0.6);
  near(spread(m)!, 0.02);
  const r = runMarketModel(m, candles([0.6, 0.6, 0.61, 0.6, 0.6, 0.59, 0.6]));
  assert.equal(r.confidence, "high");
  assert.ok(r.estimate! > 0.55 && r.estimate! < 0.65);
  assert.equal(r.noteworthy, false, "a gap inside spread and fees must not be flagged");
  assert.ok(r.caveats.some((c) => /heuristic/i.test(c)));
});

test("market model: thin, wide markets get low confidence and are never flagged", () => {
  const r = runMarketModel(market({ yesBid: 0.3, yesAsk: 0.5, volume24h: 20 }), candles([0.7, 0.72, 0.71, 0.7, 0.69]));
  assert.equal(r.confidence, "low");
  assert.equal(r.noteworthy, false);
  const none = runMarketModel(market({ yesBid: null, yesAsk: null, lastPrice: null }), []);
  assert.equal(none.estimate, null);
});

test("movement summary", () => {
  const s = summarizeMovement(candles([0.4, 0.42, 0.6, 0.58]))!;
  near(s.change, 0.18);
  near(s.biggestMove.delta, 0.18);
  assert.equal(summarizeMovement(candles([0.4])), null);
});

test("provenance ages from live to delayed", () => {
  const fresh = refreshProvenance({ source: "kalshi", freshness: "live", fetchedAt: new Date().toISOString() });
  assert.equal(fresh.freshness, "live");
  const old = refreshProvenance({ source: "kalshi", freshness: "live", fetchedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
  assert.equal(old.freshness, "delayed");
  const demo = refreshProvenance({ source: "demo", freshness: "demo", fetchedAt: new Date(0).toISOString() });
  assert.equal(demo.freshness, "demo");
});

test("post-auth redirects only allow same-origin paths", () => {
  assert.equal(safeNextPath("/markets/KX-1"), "/markets/KX-1");
  assert.equal(safeNextPath("https://evil.example"), "/overview");
  assert.equal(safeNextPath("//evil.example"), "/overview");
  assert.equal(safeNextPath("/\\evil.example"), "/overview");
  assert.equal(safeNextPath(null), "/overview");
});

test("community moderation rejects touting, allows analysis", () => {
  assert.equal(checkCommunityContent("My model says 62% with wide error bars; here is the sample size.").ok, true);
  assert.equal(checkCommunityContent("LOCK OF THE DAY!!! free money").ok, false);
  assert.equal(checkCommunityContent("Guaranteed winner tonight, DM me for picks").ok, false);
  assert.equal(checkCommunityContent("This can't lose").ok, false);
});


test("devig: proportional removes the margin and sums to one", () => {
  // Two-sided book with -110/-110 => raw 0.5238 each, ~4.76% overround.
  const raw = [americanToProb(-110), americanToProb(-110)];
  near(overround(raw), 0.0476, 1e-3);
  const r = devigProportional(raw);
  near(r.fair[0]! + r.fair[1]!, 1);
  near(r.fair[0]!, 0.5);
  near(r.overround, 0.0476, 1e-3);
});

test("devig: power and shin also normalise to one and agree on a fair book", () => {
  const raw = [0.55, 0.50]; // 5% margin, favourite 0.55
  for (const m of ["proportional", "power", "shin"] as const) {
    const r = devig(raw, m);
    near(r.fair[0]! + r.fair[1]!, 1);
    assert.ok(r.fair[0]! > r.fair[1]!, m + " keeps the favourite on top");
  }
  // Under margin the power method raises the favourite vs proportional (the
  // favourite-longshot correction) and lowers the longshot.
  const prop = devigProportional(raw).fair[0]!;
  const pow = devigPower(raw).fair[0]!;
  assert.ok(pow >= prop - 1e-9, "power favourite is at least the proportional favourite");
  assert.ok(devigPower(raw).fair[1]! <= devigProportional(raw).fair[1]! + 1e-9, "power lowers the longshot");
  const shin = devigShin([raw[0]!, raw[1]!]);
  assert.ok(shin.insiderShare! >= 0 && shin.insiderShare! < 0.3, "shin insider share in range");
});

test("devig: a fair (no-margin) book is returned unchanged", () => {
  const r = devigProportional([0.6, 0.4]);
  near(r.overround, 0);
  near(r.fair[0]!, 0.6);
});


function quote(venue: "kalshi" | "polymarket", ask: number, fee = 0, liquidity = 50000): VenueQuote {
  return { venue, venueLabel: venue === "kalshi" ? "Kalshi" : "Polymarket", ask, mid: ask, spread: 0.01, liquidity, volume24h: 100000, fee, freshness: "live", fetchedAt: new Date().toISOString(), href: null };
}
function twoSide(aK: number, aP: number, bK: number, bP: number): SideComparison[] {
  return [
    { label: "Team A", venues: [quote("kalshi", aK, 0.01), quote("polymarket", aP)] },
    { label: "Team B", venues: [quote("kalshi", bK, 0.01), quote("polymarket", bP)] },
  ];
}
const baseInput = { key: "t", title: "A @ B", category: "Sports", subtitle: null, kind: "sports_game" as const, startsAt: null, matchConfidence: "high" as const, matchReason: "" };

test("line comparison: detects a real cross-venue lock and sizes it", () => {
  // Team A cheapest 40c on Kalshi (+1c fee), Team B cheapest 52c on Polymarket -> 93c total < $1.
  const c = compareEvent({ ...baseInput, sides: twoSide(0.4, 0.45, 0.62, 0.52) });
  assert.ok(c.arbitrage, "an arbitrage should be found");
  near(c.arbitrage!.combinedCost, 0.93, 1e-9); // 0.40+0.01 + 0.52
  near(c.arbitrage!.profit, 0.07, 1e-9);
  assert.equal(c.arbitrage!.legs[0]!.venue, "kalshi");
  assert.equal(c.arbitrage!.legs[1]!.venue, "polymarket");
  assert.equal(c.opportunity, "strong");
});

test("line comparison: no lock when the two sides cost >= $1, and best price is factual", () => {
  const c = compareEvent({ ...baseInput, sides: twoSide(0.55, 0.57, 0.47, 0.45) });
  assert.equal(c.arbitrage, null, "efficient cross-market has no lock");
  // best (cheapest) price for Team A is Kalshi 55c, for Team B is Polymarket 45c
  assert.equal(c.bestPrice[0]!.venue, "kalshi");
  assert.equal(c.bestPrice[1]!.venue, "polymarket");
});

test("line comparison: a phantom lock from a stale quote is ignored", () => {
  const sides = twoSide(0.4, 0.45, 0.62, 0.52);
  sides[0]!.venues[0]!.freshness = "delayed"; // the cheap Team A leg is stale
  const c = compareEvent({ ...baseInput, sides });
  assert.equal(c.arbitrage, null, "a lock that depends on a stale price must not be shown");
});

test("plans: one paid tier (Pro) unlocks the full product; transparency is never gated", () => {
  assert.ok(PLANS.free.limits.aiQueriesPerDay < PLANS.pro.limits.aiQueriesPerDay);
  assert.ok(PLANS.free.limits.academyLevels.includes("beginner"));
  assert.equal(PLANS.free.limits.scanner, false);
  assert.equal(PLANS.pro.limits.scanner, true);
  assert.equal(PLANS.pro.limits.scannerAdvancedFilters, true);
  assert.equal(PLANS.pro.limits.performanceTracker, "advanced");
  assert.ok(tierAtLeast("pro", "pro") && !tierAtLeast("free", "pro"));
  assert.equal(PLANS.pro.priceMonthly, 19.99);
  assert.deepEqual(Object.keys(PLANS), ["free", "pro"]);
});
