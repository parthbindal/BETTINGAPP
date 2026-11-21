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
    return { label: "Whale-led", tone: "warning", detail: `One wallet holds ${Math.round(share * 100)}% of the money on this side, so the wallet count overstates how broad the agreement is.` };
  }
  const recent = h.recentEntrants;
  if (recent !== undefined && recent >= Math.max(3, Math.ceil(h.holders * 0.3))) {
    return { label: "Converging now", tone: "primary", detail: `${recent} of ${h.holders} wallets first entered in the last 7 days.` };
  }
  if (h.firstEntry && h.lastEntry) {
    const days = (Date.parse(h.lastEntry) - Date.parse(h.firstEntry)) / 86_400_000;
    if (days >= 30) return { label: "Long-held", tone: "neutral", detail: `Entries span ${Math.round(days)} days: established positioning rather than a fresh move.` };
  }
  return { label: "Broad", tone: "neutral", detail: share !== undefined ? `Spread across ${h.holders} wallets; the largest holds ${Math.round(share * 100)}% of the money.` : `Held by ${h.holders} tracked wallets.` };
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
