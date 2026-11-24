/**
 * Pure helpers for the live leaderboard (components/intel/live-board.tsx).
 * The browser reads Polymarket's public leaderboard directly and these merge
 * it into the rows the hourly scan rendered: ranks and profit come from
 * Polymarket now, while everything read from positions (open bets, ROI,
 * exposure) stays as scanned.
 */
import type { LeaderEntry } from "@/lib/data/providers/polymarket-whales";

/** The minimum a row needs for live ranks and profit to apply to it. */
export interface RankedRow {
  wallet: string;
  name: string;
  rank: number;
  pnl: number;
}

const key = (wallet: string) => wallet.toLowerCase();

export function indexByWallet(rows: LeaderEntry[]): Map<string, LeaderEntry> {
  return new Map(rows.map((r) => [key(r.wallet), r]));
}

/** Changes whenever any rank or profit in `rows` does; cheap to compare between polls. */
export function boardSignature(rows: LeaderEntry[]): string {
  return rows.map((r) => `${key(r.wallet)}:${r.rank}:${r.pnl}`).join("|");
}

/** Places gained (positive) or lost since `baseline`, the first live read on this page. Unmoved traders are left out. */
export function rankMoves(baseline: Map<string, LeaderEntry> | null, next: Map<string, LeaderEntry>): Map<string, number> {
  const out = new Map<string, number>();
  if (!baseline) return out;
  for (const [w, r] of next) {
    const before = baseline.get(w);
    if (before && before.rank !== r.rank) out.set(w, before.rank - r.rank);
  }
  return out;
}

/** Rows with live rank, profit and name wherever Polymarket has them; the rest keep their scanned figures. */
export function withLive<T extends RankedRow>(rows: T[], live: Map<string, LeaderEntry> | null): T[] {
  if (!live) return rows;
  return rows.map((r) => {
    const l = live.get(key(r.wallet));
    return l && (l.rank !== r.rank || l.pnl !== r.pnl || l.name !== r.name) ? { ...r, rank: l.rank, pnl: l.pnl, name: l.name } : r;
  });
}

/**
 * The first `n` traders in live rank order, each joined to its scanned row.
 * A trader new to the top since the scan has no scanned row yet and gets
 * `blank(entry)`, so nothing is invented for them.
 */
export function liveTop<T extends RankedRow>(scanned: T[], live: LeaderEntry[] | null, n: number, blank: (e: LeaderEntry) => T): T[] {
  if (!live?.length) return [...scanned].sort((a, b) => a.rank - b.rank).slice(0, n);
  const byWallet = new Map(scanned.map((r) => [key(r.wallet), r]));
  return [...live]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n)
    .map((l) => {
      const s = byWallet.get(key(l.wallet));
      return s ? { ...s, rank: l.rank, pnl: l.pnl, name: l.name } : blank(l);
    });
}
