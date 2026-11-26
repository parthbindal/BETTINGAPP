/**
 * Shared helpers for the smart-money pages: identity formatting, outbound
 * links that let readers verify a figure at its source, and a descriptive read
 * of what kind of agreement a consensus outcome is. Nothing here recommends a
 * trade.
 */
import type { ConsensusHolding, HolderPair, SharedPosition, WhalePayload, WhaleHistoryPoint } from "@/lib/whales";

export const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
export const isWalletAddress = (s: string) => WALLET_RE.test(s);
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Trader profiles stay on polymarket.com: the tracked wallets trade on Polymarket's international,
// on-chain exchange, and Polymarket US has no public pages for them.
export const polymarketProfileUrl = (wallet: string) => `https://polymarket.com/profile/${wallet}`;
export const polygonTxUrl = (hash: string) => `https://polygonscan.com/tx/${hash}`;
export const walletHref = (wallet: string) => `/wallets/${wallet}`;

/** Milliseconds elapsed since an ISO timestamp, measured when called (request time on the server). */
export const ageMs = (iso: string) => Date.now() - Date.parse(iso);
/** Epoch milliseconds at the start of a trailing window of `days`. */
export const windowStart = (days: number) => Date.now() - days * 86_400_000;

export type ConsensusTone = "primary" | "warning" | "neutral";
export interface ConsensusRead {
  label: "Converging now" | "Broad" | "Long-held" | "Whale-led";
  tone: ConsensusTone;
  detail: string;
}

/**
 * What kind of agreement this is, from breadth, concentration and entry timing.
 * A label describes the positioning; it is never a signal to copy it.
 */
/**
 * The consumer name for each internal read. The ledger stores the internal
 * label (it is part of the permanent record), and every screen shows this one,
 * so the app and the public track record use the same words.
 */
export const KIND_LABEL: Record<ConsensusRead["label"], string> = {
  "Converging now": "New money this week",
  "Long-held": "Long-term bet",
  "Whale-led": "Mostly one trader",
  Broad: "Many traders agree",
};
export const kindLabel = (internal: string): string => KIND_LABEL[internal as ConsensusRead["label"]] ?? internal;

export function readConsensus(h: ConsensusHolding): ConsensusRead {
  const share = h.topHolderShare;
  if (share !== undefined && share >= 0.5) {
    return { label: "Whale-led", tone: "warning", detail: `One trader holds ${Math.round(share * 100)}% of the money on this side, so fewer people are really behind it than the trader count suggests.` };
  }
  const recent = h.recentEntrants;
  if (recent !== undefined && recent >= Math.max(3, Math.ceil(h.holders * 0.3))) {
    return { label: "Converging now", tone: "primary", detail: `${recent} of these ${h.holders} traders made their first purchase in the last 7 days.` };
  }
  if (h.firstEntry && h.lastEntry) {
    const days = (Date.parse(h.lastEntry) - Date.parse(h.firstEntry)) / 86_400_000;
    if (days >= 30) return { label: "Long-held", tone: "neutral", detail: `These traders have been buying for ${Math.round(days)} days, so this is a long-running bet rather than a new move.` };
  }
  return { label: "Broad", tone: "neutral", detail: share !== undefined ? `The money is spread across ${h.holders} traders; the biggest holds only ${Math.round(share * 100)}% of it.` : `Held by ${h.holders} of the top traders.` };
}

/** Change between the last two same-method scans, or null when there is no earlier scan to compare. */
export function scanChange(history: WhaleHistoryPoint[], key: keyof Omit<WhaleHistoryPoint, "generatedAt">): { pct: number; from: string } | null {
  if (history.length < 2) return null;
  const prev = history[history.length - 2]!;
  const cur = history[history.length - 1]!;
  const a = prev[key];
  const b = cur[key];
  if (!a) return null;
  return { pct: (b - a) / a, from: prev.generatedAt };
}

/**
 * Last N days of tracked-trader flow by UTC day, for the activity chart. Uses
 * the scan's per-day totals over every trade, and drops days before the point
 * where trade coverage is complete, so a missing day never reads as a quiet one.
 */
export function dailyActivity(payload: WhalePayload, days: number): Array<{ day: string; buys: number; sells: number; trades: number; partial?: boolean }> {
  if (payload.dailyFlow?.length) {
    const from = payload.coverageFrom;
    const fromDay = from?.slice(0, 10);
    // A day is partial when it starts before the point where every trader's trades are complete.
    return payload.dailyFlow.slice(-days).map((d) => ({ ...d, partial: Boolean(from && fromDay && (d.day < fromDay || (d.day === fromDay && !from.endsWith("T00:00:00.000Z")))) }));
  }
  // Older snapshots: bucket the stored feed (it may not cover every day).
  const now = Date.now();
  const start = new Date(now - (days - 1) * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, { buys: number; sells: number; trades: number }>();
  for (let i = 0; i < days; i++) buckets.set(new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10), { buys: 0, sells: 0, trades: 0 });
  for (const m of payload.recentMoves) {
    const b = buckets.get(m.tsIso.slice(0, 10));
    if (!b) continue;
    b.trades++;
    if (m.side === "BUY") b.buys += m.usd;
    else b.sells += m.usd;
  }
  return [...buckets.entries()].map(([day, v]) => ({ day, ...v }));
}

/**
 * A bet is still "in play" while its price has not effectively settled
 * (between 3¢ and 97¢). Decided markets never headline.
 *
 * Deliberately NOT based on end dates. Polymarket's end_date is an estimate:
 * on 2026-11-25, 909 positions sat 36h+ past their end date in markets
 * Polymarket still had open and trading (e.g. "next Prime Minister of
 * Israel", end date Oct 28, trading at 82¢ with $1.8M from 29 top traders),
 * and "1970-01-01" means "no date". Finished bets are removed where the truth
 * is known instead: the reader drops positions Polymarket marks REDEEMABLE or
 * whose market it reports closed (see closedMarketIds in polymarket-whales).
 *
 * One date rule does hold: a single game. For Sports the end date is the
 * kickoff, so a game whose day is 36h+ gone while its market is still open was
 * postponed or is stuck awaiting a result (e.g. "Will Athletic Club win on
 * 2026-10-10?", still open and at 51c six weeks later). That is not a live bet,
 * so it never headlines. The 36h covers late US games that end after midnight UTC.
 */
export function isInPlay(h: { currentPrice: number; category?: string; endDate?: string | null }): boolean {
  return h.currentPrice > 0.03 && h.currentPrice < 0.97 && !isOverdueGame(h);
}

const OVERDUE_GAME_MS = 36 * 3_600_000;

/** A Sports market whose scheduled game day is 36h+ past (see isInPlay). Political "next X" end dates are placeholders and never count. */
export function isOverdueGame(h: { category?: string; endDate?: string | null }): boolean {
  if (h.category !== "Sports" || !h.endDate) return false;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(h.endDate) ? `${h.endDate}T00:00:00Z` : h.endDate);
  // Polymarket sends 1970-01-01 for "no date".
  return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) && Date.now() > t + OVERDUE_GAME_MS;
}

/** Where members are sent to trade: Polymarket US, the exchange open to US users (polymarket.com is not). */
export const POLYMARKET_US = "https://polymarket.us";

/**
 * The Polymarket US page for a market, or null when Polymarket US does not list
 * it. `usEvent` is set only by an exact lookup against Polymarket US's own API
 * (usListedEvents in providers/polymarket-whales), so every link this returns
 * opens a real page on the right game.
 *
 * There is deliberately no fallback. A search link (tried first, 2026-11-25)
 * landed on the right market for 3 of 8 live signals and on a different one,
 * or nothing, for the rest; a member who cannot trade a market is better told
 * so than sent somewhere that looks right and is not.
 */
export function polymarketUsUrl(usEvent: string | null | undefined): string | null {
  return usEvent ? `${POLYMARKET_US}/event/${encodeURIComponent(usEvent)}` : null;
}

/**
 * The exact market page on polymarket.com, for EVIDENCE rather than trading:
 * the public track record links each call to the market it was made on, and
 * its result. Only polymarket.com has that page (and keeps it after the market
 * settles); a Polymarket US search cannot find a finished game.
 */
export function polymarketRecordUrl(eventSlug: string | null | undefined, marketSlug?: string | null): string | null {
  if (eventSlug && marketSlug) return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return null;
}

/** Both sides of one market held by many top traders. Sides come sorted by trader count, most first. */
export function splitSides<T extends { conditionId: string; holders: number; totalValue: number }>(all: T[], minHolders: number): Map<string, T[]> {
  const by = new Map<string, T[]>();
  for (const h of all) if (h.holders >= minHolders) by.set(h.conditionId, [...(by.get(h.conditionId) ?? []), h]);
  const out = new Map<string, T[]>();
  for (const [id, sides] of by) if (sides.length >= 2) out.set(id, [...sides].sort((a, b) => b.holders - a.holders || b.totalValue - a.totalValue));
  return out;
}

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

type Side = { outcome: string; holders: number; totalValue: number };

/** One plain sentence on a split market: who has more traders, and whether the money agrees. */
export function explainSplit(a: Side, b: Side): string {
  if (a.holders === b.holders) {
    if (a.totalValue === b.totalValue) return `Top traders are evenly split: ${a.holders} on each side.`;
    const [more, less] = a.totalValue > b.totalValue ? [a, b] : [b, a];
    return `Top traders are evenly split (${a.holders} each), but more money is on ${more.outcome} (${money(more.totalValue)} vs ${money(less.totalValue)}).`;
  }
  const head = `More top traders back ${a.outcome} (${a.holders} vs ${b.holders})`;
  return a.totalValue >= b.totalValue
    ? `${head}, and they have more money on it too (${money(a.totalValue)} vs ${money(b.totalValue)}).`
    : `${head}, but more money is on ${b.outcome} (${money(b.totalValue)} vs ${money(a.totalValue)}).`;
}

/** Caption for the daily money-flow chart, naming any high-frequency traders left out of it. */
export function flowCaption(p: { recentTraders?: number; flowExcluded?: number }): string {
  const n = p.recentTraders ?? 100;
  const x = p.flowExcluded ?? 0;
  return x > 0
    ? `Dollars bought and sold each day by the top ${n} traders, excluding ${x} high-frequency trader${x === 1 ? "" : "s"} whose full history Polymarket does not return`
    : `Dollars bought and sold each day by the top ${n} traders`;
}

/** Share of `values` strictly below `v`, 0..1. Ties do not count as beaten. */
export function percentileOf(values: number[], v: number): number {
  const finite = values.filter((x) => Number.isFinite(x));
  if (!finite.length || !Number.isFinite(v)) return 0;
  return finite.filter((x) => x < v).length / finite.length;
}

/** "Top 3%" / "Bottom 40%" wording for a percentile, never "Top 0%". */
export function standingLabel(p: number): string {
  if (p >= 0.5) return `Top ${Math.max(1, Math.round((1 - p) * 100))}%`;
  return `Bottom ${Math.max(1, Math.round((p + 1 / 1000) * 100))}%`;
}

/** Price change since the traders' value-weighted average entry, as a fraction (0.7 = +70%). */
export function sinceEntry(h: { avgEntry: number; currentPrice: number }): number {
  return h.avgEntry > 0 ? (h.currentPrice - h.avgEntry) / h.avgEntry : 0;
}

/** Up, down, or no real change: under half a percent reads as "no change", the rule PriceTrack uses. */
export function moveDirection(change: number): "up" | "down" | "flat" {
  return Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down";
}

/**
 * The map's tint tier for a move: 0 under 2%, then 2-8%, 8-20% and 20%+.
 * Named buckets rather than a continuous ramp, so a reader can say which one a
 * tile is in and the legend can list them.
 */
export function moveTier(change: number): 0 | 1 | 2 | 3 {
  const a = Math.abs(change);
  return a < 0.02 ? 0 : a < 0.08 ? 1 : a < 0.2 ? 2 : 3;
}

/** How much of the money (by dollars, not by count) sits on prices that are up, down, or unchanged since entry. */
export function moneyByMove(items: Array<{ avgEntry: number; currentPrice: number; totalValue: number }>): { total: number; up: number; down: number; flat: number } {
  const out = { total: 0, up: 0, down: 0, flat: 0 };
  for (const h of items) {
    if (!(h.totalValue > 0)) continue;
    out.total += h.totalValue;
    out[moveDirection(sinceEntry(h))] += h.totalValue;
  }
  return out;
}

/** How many signals Free members see in full (cards and deep dives). */
export const FREE_SIGNALS = 3;

/**
 * The free preview: the biggest few live signals in the order Signals lists
 * them (dollars first), one per market, with both sides when top traders are
 * split. Signals and the deep-dive page both use this, so a free member can
 * open exactly the signals they were shown.
 */
export function freePreviewTokens(
  holdings: Array<{ tokenId: string; conditionId: string; holders: number; totalValue: number; currentPrice: number }>,
  minHolders: number,
  n = FREE_SIGNALS,
): Set<string> {
  const base = holdings.filter((h) => h.holders >= minHolders && isInPlay(h)).sort((a, b) => b.totalValue - a.totalValue || b.holders - a.holders);
  const splits = splitSides(base, minHolders);
  const out = new Set<string>();
  const markets = new Set<string>();
  for (const h of base) {
    if (markets.size >= n) break;
    if (markets.has(h.conditionId)) continue;
    markets.add(h.conditionId);
    for (const side of splits.get(h.conditionId) ?? [h]) out.add(side.tokenId);
  }
  return out;
}

/**
 * Pairs of traders by how many live shared positions they hold in common,
 * biggest overlap first. Counts in-play sides only: two traders both sitting on
 * "No" at 99c says nothing about shared judgement. Each side contributes one to
 * every pair among its holders.
 */
export function holderPairsFrom(shared: Array<Pick<SharedPosition, "ranks" | "title" | "outcome" | "currentPrice" | "category" | "endDate">>, opts: { min?: number; keep?: number } = {}): HolderPair[] {
  const min = opts.min ?? 3;
  const pairs = new Map<string, HolderPair>();
  for (const s of shared) {
    if (!isInPlay(s)) continue;
    const r = [...new Set(s.ranks.filter((x) => x > 0))].sort((x, y) => x - y);
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const key = `${r[i]}:${r[j]}`;
        const p = pairs.get(key) ?? { aRank: r[i]!, bRank: r[j]!, shared: 0, markets: [] };
        p.shared++;
        if (p.markets.length < 5) p.markets.push({ title: s.title, outcome: s.outcome });
        pairs.set(key, p);
      }
    }
  }
  return [...pairs.values()].filter((p) => p.shared >= min).sort((a, b) => b.shared - a.shared || a.aRank - b.aRank || a.bRank - b.bRank).slice(0, opts.keep ?? 60);
}
