/**
 * Price-first comparison engine. Given a two-outcome event quoted on several
 * venues, it devigs each venue, forms a liquidity-weighted consensus fair
 * probability, finds the best available price for each side, computes the
 * estimated edge and EV net of fees, and classifies the result transparently.
 *
 * "Best price" is an objective fact (line shopping). The edge and category are
 * labeled estimates with their reasons; nothing is called a guaranteed winner.
 */
import type { Arbitrage, EventComparison, OppCategory, SideComparison, VenueQuote } from "@/lib/data/cross-source";
import { devigProportional } from "@/lib/analytics/devig";

/** Per-venue no-vig fair probabilities for the two sides, from each venue's own asks. */
function venueFair(sides: SideComparison[], venueIndex: number): number[] | null {
  const asks = sides.map((s) => s.venues[venueIndex]?.ask ?? null);
  if (asks.some((a) => a === null || !(a > 0 && a < 1))) return null;
  return devigProportional(asks as number[]).fair;
}

export function compareEvent(input: Omit<EventComparison, "fair" | "bestPrice" | "bestEdge" | "discrepancyScore" | "opportunity" | "arbitrage" | "reasons" | "caveats">): EventComparison {
  const { sides } = input;
  const nSides = sides.length;
  const venueCount = sides[0]?.venues.length ?? 0;
  const reasons: string[] = [];
  const caveats: string[] = [];

  // Consensus fair: liquidity-weighted average of each venue's no-vig probabilities.
  const perVenueFair: Array<{ fair: number[]; weight: number; label: string }> = [];
  for (let v = 0; v < venueCount; v++) {
    const fair = venueFair(sides, v);
    if (!fair) continue;
    const liq = Math.max(1, sides.reduce((a, s) => a + (s.venues[v]?.liquidity ?? 0), 0));
    perVenueFair.push({ fair, weight: Math.log10(liq + 10), label: sides[0]!.venues[v]!.venueLabel });
  }
  const fair: number[] = Array.from({ length: nSides }, (_, i) => {
    if (!perVenueFair.length) return NaN;
    const wsum = perVenueFair.reduce((a, pv) => a + pv.weight, 0);
    return perVenueFair.reduce((a, pv) => a + (pv.fair[i] ?? 0) * pv.weight, 0) / wsum;
  });
  if (perVenueFair.length >= 2) reasons.push(`Consensus fair probability is the liquidity-weighted no-vig average of ${perVenueFair.map((p) => p.label).join(" and ")}.`);
  else if (perVenueFair.length === 1) caveats.push(`Only ${perVenueFair[0]!.label} had a complete two-sided quote, so the "consensus" is that single venue's no-vig price.`);
  else caveats.push("No venue had a complete two-sided quote, so no fair probability could be formed.");

  // Best (lowest) ask per side.
  const bestPrice = sides.map((s, i) => {
    let best: { sideIndex: number; venue: VenueQuote["venue"]; venueLabel: string; ask: number } | null = null;
    for (const v of s.venues) if (v.ask !== null && (best === null || v.ask < best.ask)) best = { sideIndex: i, venue: v.venue, venueLabel: v.venueLabel, ask: v.ask };
    return best;
  });

  // Edge + EV for every (side, venue): edge = fair - ask - fee.
  let bestEdge: EventComparison["bestEdge"] = null;
  for (let i = 0; i < nSides; i++) {
    const f = fair[i];
    if (f === undefined || Number.isNaN(f)) continue;
    for (const v of sides[i]!.venues) {
      if (v.ask === null) continue;
      const cost = v.ask + v.fee;
      const edgePts = f - cost;
      const evPerDollar = cost > 0 ? (f - cost) / cost : NaN;
      if (bestEdge === null || edgePts > bestEdge.edgePts) bestEdge = { sideIndex: i, venue: v.venue, venueLabel: v.venueLabel, edgePts, evPerDollar };
    }
  }

  // Line-shopping callout: where the same side is cheaper on one venue.
  for (let i = 0; i < nSides; i++) {
    const asks = sides[i]!.venues.filter((v) => v.ask !== null).map((v) => ({ v, ask: v.ask as number }));
    if (asks.length >= 2) {
      asks.sort((a, b) => a.ask - b.ask);
      const gap = asks[asks.length - 1]!.ask - asks[0]!.ask;
      if (gap >= 0.01) reasons.push(`For "${sides[i]!.label}", the best price is ${(asks[0]!.ask * 100).toFixed(0)}¢ on ${asks[0]!.v.venueLabel} vs ${(asks[asks.length - 1]!.ask * 100).toFixed(0)}¢ elsewhere — a ${(gap * 100).toFixed(0)}¢ line-shopping difference.`);
    }
  }

  // Cross-venue arbitrage: buy each side on its cheapest venue (by total cost incl. fees).
  // For a 2-outcome event exactly one side wins, so if the two cheapest legs cost < $1
  // together, the position is locked for a profit (before execution/liquidity limits).
  let arbitrage: Arbitrage | null = null;
  if (nSides === 2) {
    const legs = sides.map((s, i) => {
      let best: { leg: { sideIndex: number; sideLabel: string; venue: VenueQuote["venue"]; venueLabel: string; ask: number; fee: number }; cost: number; liq: number; fresh: boolean } | null = null;
      for (const v of s.venues) {
        if (v.ask === null) continue;
        const cost = v.ask + v.fee;
        if (!best || cost < best.cost) best = { leg: { sideIndex: i, sideLabel: s.label, venue: v.venue, venueLabel: v.venueLabel, ask: v.ask, fee: v.fee }, cost, liq: v.liquidity, fresh: v.freshness === "live" };
      }
      return best;
    });
    if (legs[0] && legs[1]) {
      const combinedCost = legs[0].cost + legs[1].cost;
      const bothFresh = legs[0].fresh && legs[1].fresh;
      const bothLiquid = legs[0].liq > 0 && legs[1].liq > 0;
      // require a real gap (< 99.5c), live prices, and some liquidity to avoid phantom arbs
      if (combinedCost < 0.995 && bothFresh && bothLiquid) {
        arbitrage = { combinedCost, profit: 1 - combinedCost, roi: (1 - combinedCost) / combinedCost, legs: [legs[0].leg, legs[1].leg] };
        reasons.unshift(
          `Locked cross-venue edge: buy "${legs[0]!.leg.sideLabel}" at ${(legs[0]!.leg.ask * 100).toFixed(0)}¢ on ${legs[0]!.leg.venueLabel} and "${legs[1]!.leg.sideLabel}" at ${(legs[1]!.leg.ask * 100).toFixed(0)}¢ on ${legs[1]!.leg.venueLabel} — ${(combinedCost * 100).toFixed(1)}¢ total for a guaranteed $1, about ${((1 - combinedCost) * 100).toFixed(1)} points of locked edge before execution costs.`,
        );
      }
    }
  }

  // Discrepancy / opportunity score.
  const edgePts = bestEdge?.edgePts ?? -1;
  const minLiquidity = Math.min(...sides.flatMap((s) => s.venues.map((v) => v.liquidity)).filter((x) => x > 0), Infinity);
  const anyDelayed = sides.some((s) => s.venues.some((v) => v.freshness === "delayed"));
  const twoVenue = venueCount >= 2 && perVenueFair.length >= 2;
  let score = 0;
  score += Math.max(0, Math.min(55, edgePts * 100 * 7)); // edge after fees dominates
  score += twoVenue ? 20 : 0; // cross-venue agreement available
  score += minLiquidity >= 50_000 ? 15 : minLiquidity >= 5_000 ? 8 : 0;
  score += anyDelayed ? 0 : 10;
  score = Math.round(Math.max(0, Math.min(100, score)));

  let opportunity: OppCategory;
  if (!perVenueFair.length) opportunity = "insufficient";
  else if (edgePts >= 0.04 && twoVenue && minLiquidity >= 5_000 && !anyDelayed) opportunity = "strong";
  else if (edgePts >= 0.02 && minLiquidity >= 1_000) opportunity = "moderate";
  else if (edgePts >= 0.005) opportunity = "low";
  else opportunity = "none";

  if (opportunity === "strong") reasons.push(`Classified "strong": estimated edge after fees of ${(edgePts * 100).toFixed(1)} points, confirmed by two venues, with workable liquidity.`);
  if (opportunity === "none") reasons.push("No meaningful edge after fees — the venues broadly agree, which is the usual and expected result.");
  if (!twoVenue && perVenueFair.length) caveats.push("Only one venue priced this fully, so the fair estimate has no cross-market check and the edge could be an artifact of one book.");
  if (anyDelayed) caveats.push("At least one quote is delayed; prices may have moved.");
  caveats.push("Fair probability and edge are estimates, not facts. A positive edge is a reason to research the settlement rules and news, never a guaranteed profit. Fees, spread, liquidity and model error all apply.");

  if (arbitrage) caveats.unshift("A cross-venue “lock” requires filling both legs fast and in size, on two platforms with different funding (Kalshi in USD, Polymarket in USDC); slippage, limits and transfer time can erase it. Shown as an educational signal, not an instruction.");
  return { ...input, fair, bestPrice, bestEdge, discrepancyScore: arbitrage ? Math.max(score, 85) : score, opportunity: arbitrage ? "strong" : opportunity, arbitrage, reasons, caveats };
}

export const OPP_LABELS: Record<OppCategory, string> = {
  strong: "Strong analytical discrepancy",
  moderate: "Moderate discrepancy",
  low: "Low-confidence discrepancy",
  insufficient: "Insufficient information",
  none: "No identifiable discrepancy",
};
