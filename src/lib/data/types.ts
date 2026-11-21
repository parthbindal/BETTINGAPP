/**
 * Normalized data types shared by every provider. Every record carries
 * provenance so the UI can label live / delayed / historical / demo data.
 */
export type Freshness = "live" | "delayed" | "historical" | "demo" | "estimate";

export interface Provenance {
  source: string; // "kalshi" | "demo" | "balldontlie" | "edgewise-model"
  freshness: Freshness;
  fetchedAt: string; // ISO
  note?: string;
}

export interface NormalizedMarket {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  subtitle: string | null;
  yesSubTitle: string | null;
  category: string;
  status: string;
  yesBid: number | null;
  yesAsk: number | null;
  lastPrice: number | null;
  previousPrice: number | null;
  volume: number;
  volume24h: number;
  openInterest: number;
  openTime: string | null;
  closeTime: string | null;
  expirationTime: string | null;
  rulesPrimary: string | null;
  rulesSecondary: string | null;
  result: string | null;
  provenance: Provenance;
}

export interface NormalizedEvent {
  eventTicker: string;
  seriesTicker: string;
  title: string;
  subTitle: string | null;
  category: string;
  mutuallyExclusive: boolean;
  settlementSources: Array<{ name: string; url?: string }>;
  markets: NormalizedMarket[];
  provenance: Provenance;
}

export interface Candle {
  ts: number; // unix seconds (end of period)
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  mean: number | null;
  yesBidClose: number | null;
  yesAskClose: number | null;
  volume: number;
  openInterest: number;
}

export interface Trade {
  id: string;
  ts: string;
  yesPrice: number;
  count: number;
  takerSide: "yes" | "no";
}

export interface SeriesInfo {
  ticker: string;
  title: string;
  category: string;
  frequency: string | null;
  feeType: string | null;
  contractUrl: string | null;
  settlementSources: Array<{ name: string; url?: string }>;
}

/** The mid price is the best proxy for implied probability when there is a two-sided book. */
export function impliedProbability(m: Pick<NormalizedMarket, "yesBid" | "yesAsk" | "lastPrice">): number | null {
  if (m.yesBid !== null && m.yesAsk !== null && m.yesAsk > 0) return (m.yesBid + m.yesAsk) / 2;
  if (m.lastPrice !== null) return m.lastPrice;
  return null;
}

/** Bid–ask spread in dollars, rounded to 1/100 of a cent so float noise cannot flip threshold checks (0.61 − 0.59 is not exactly 0.02). */
export function spread(m: Pick<NormalizedMarket, "yesBid" | "yesAsk">): number | null {
  if (m.yesBid === null || m.yesAsk === null) return null;
  return Math.round((m.yesAsk - m.yesBid) * 10_000) / 10_000;
}

export const MARKET_CATEGORIES = [
  "Economics",
  "Financials",
  "Elections",
  "Politics",
  "Climate and Weather",
  "Science and Technology",
  "Entertainment",
  "Sports",
  "Companies",
  "Health",
  "World",
] as const;

/** Recompute the freshness label at render time (cached records age). */
export function refreshProvenance(p: Provenance, liveWindowMs = 2 * 60_000): Provenance {
  if (p.freshness === "demo" || p.freshness === "historical" || p.freshness === "estimate") return p;
  const age = Date.now() - new Date(p.fetchedAt).getTime();
  return age > liveWindowMs ? { ...p, freshness: "delayed", note: `Cached ${Math.round(age / 60_000)} min ago` } : { ...p, freshness: "live", note: undefined };
}
