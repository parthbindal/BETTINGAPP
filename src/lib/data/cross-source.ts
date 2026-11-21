/**
 * Normalized cross-platform price quote. Every connected venue (Kalshi,
 * Polymarket, and — once a licensed odds key is added — sportsbooks) maps
 * into this shape so the comparison engine is source-agnostic.
 */
export type Venue = "kalshi" | "polymarket" | "sportsbook";

export interface VenueQuote {
  venue: Venue;
  venueLabel: string;
  /** What a buyer pays for this side, 0..1 (implied probability incl. any margin). */
  ask: number | null;
  /** Mid implied probability (for de-vig reference). */
  mid: number | null;
  spread: number | null;
  liquidity: number;
  volume24h: number;
  /** Per-contract fee a taker pays at this price, in dollars. */
  fee: number;
  freshness: "live" | "delayed";
  fetchedAt: string;
  /** Deep link to the market on the venue, if available. */
  href: string | null;
}

export interface SideComparison {
  label: string; // e.g. "Boston wins" / "YES"
  venues: VenueQuote[];
}

export type OppCategory = "strong" | "moderate" | "low" | "insufficient" | "none";

export interface EventComparison {
  key: string;
  title: string;
  category: string; // market category (Sports, Financials, ...)
  subtitle: string | null;
  kind: "sports_game" | "named_event";
  startsAt: string | null;
  matchConfidence: "high" | "medium";
  matchReason: string;
  sides: SideComparison[];
  /** Consensus fair probability per side (liquidity-weighted no-vig). */
  fair: number[];
  /** Best (lowest) ask per side and where. */
  bestPrice: Array<{ sideIndex: number; venue: Venue; venueLabel: string; ask: number } | null>;
  /** Best estimated edge after fees across all (side, venue) cells. */
  bestEdge: { sideIndex: number; venue: Venue; venueLabel: string; edgePts: number; evPerDollar: number } | null;
  discrepancyScore: number; // 0..100
  opportunity: OppCategory;
  /** A locked cross-venue edge: buy each side on its cheapest venue for < $1 total. */
  arbitrage: Arbitrage | null;
  reasons: string[];
  caveats: string[];
}

export interface ArbLeg {
  sideIndex: number;
  sideLabel: string;
  venue: Venue;
  venueLabel: string;
  ask: number;
  fee: number;
}
export interface Arbitrage {
  combinedCost: number; // total cost (incl. fees) to own both sides, per $1 payout
  profit: number;       // 1 - combinedCost (fraction of $1)
  roi: number;          // profit / combinedCost
  legs: ArbLeg[];
}
