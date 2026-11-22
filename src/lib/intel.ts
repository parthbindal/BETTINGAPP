/**
 * Shared helpers for the smart-money pages: identity formatting, outbound
 * links that let readers verify a figure at its source, and a descriptive read
 * of what kind of agreement a consensus outcome is. Nothing here recommends a
 * trade.
 */
import type { ConsensusHolding, WhalePayload, WhaleHistoryPoint } from "@/lib/whales";

export const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
export const isWalletAddress = (s: string) => WALLET_RE.test(s);
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const polymarketEventUrl = (slug: string) => `https://polymarket.com/event/${slug}`;
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
 * A signal is still "in play" when its price has not effectively settled
 * (between 3¢ and 97¢). Decided markets stay listed but never headline.
 */
export function isInPlay(h: { currentPrice: number }): boolean {
  return h.currentPrice > 0.03 && h.currentPrice < 0.97;
}

/**
 * Link to the exact question on Polymarket. Grouped events hold many markets,
 * and only /event/<event>/<market> lands on the right one. Snapshots taken
 * before market slugs were stored fall back to the event page.
 */
export function polymarketMarketUrl(eventSlug: string | null | undefined, marketSlug?: string | null): string | null {
  if (eventSlug && marketSlug) return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
  if (eventSlug) return polymarketEventUrl(eventSlug);
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
