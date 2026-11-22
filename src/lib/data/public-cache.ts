import { cacheLife } from "next/cache";
import { getFeaturedMarkets } from "@/lib/data/markets";
import { getWhaleWatch } from "@/lib/whales";
import { fetchLeaderboard, type LeaderEntry, type LeaderboardPeriod } from "@/lib/data/providers/polymarket-whales";
import { getLedger, getRecordByKind, getSignalRecord, type LedgerRow, type SignalRecord } from "@/lib/signals";

/**
 * Featured markets for public pages, cached in memory for a few minutes so
 * anonymous traffic does not hit the database on every view. Callers recompute
 * the freshness label at render time with refreshProvenance().
 */
export async function getFeaturedMarketsCached(limit: number) {
  "use cache";
  cacheLife("minutes");
  return getFeaturedMarkets(limit);
}

export interface TrackRecordView {
  record: SignalRecord;
  byKind: Array<{ kind: string; record: SignalRecord }>;
  open: LedgerRow[];
  settled: LedgerRow[];
}

/**
 * The public signal ledger, cached for a few minutes. Anonymous traffic lands
 * on this page straight from the nav, and it runs seven aggregate queries, so
 * it must not hit Postgres per view. Minutes is the right window: the scan that
 * feeds it only runs every 15.
 */
export async function getTrackRecordCached(): Promise<TrackRecordView> {
  "use cache";
  cacheLife("minutes");
  const [record, byKind, ledger] = await Promise.all([getSignalRecord(), getRecordByKind(), getLedger({ openLimit: 40, settledLimit: 40 })]);
  return { record, byKind, open: ledger.open, settled: ledger.settled };
}

/** Tracked wallets that must hold the same outcome before public pages call it consensus. */
export const CONSENSUS_MIN_WALLETS = 10;

export interface SmartMoneyPreview {
  generatedAt: string;
  trackedWallets: number;
  positionsAnalyzed: number;
  consensusOutcomes: number;
  /** True when every stored holding clears the bar, so the real count may be higher. */
  consensusCapped: boolean;
  consensusCapital: number;
  top: Array<{
    title: string;
    outcome: string;
    holders: number;
    pctOfField: number;
    totalValue: number;
    currentPrice: number;
    category: string;
    slug: string | null;
    marketSlug: string | null;
  }>;
}

/**
 * Headline numbers and the strongest overlaps from the latest Whale Watch scan
 * (Polymarket public data), cached for a few minutes for public pages. Returns
 * null until the first scan exists, so callers show a waiting state instead of
 * inventing figures. Freshness is computed by the caller at render time.
 */
export async function getSmartMoneyPreviewCached(): Promise<SmartMoneyPreview | null> {
  "use cache";
  cacheLife("minutes");
  const w = await getWhaleWatch();
  if (!w) return null;
  const p = w.payload;
  const consensus = p.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS);
  return {
    generatedAt: p.generatedAt,
    trackedWallets: p.tradersScanned,
    positionsAnalyzed: p.positionsScanned,
    consensusOutcomes: consensus.length,
    consensusCapped: consensus.length > 0 && consensus.length === p.holdings.length,
    consensusCapital: consensus.reduce((sum, h) => sum + h.totalValue, 0),
    top: [...p.holdings]
      .sort((a, b) => b.holders - a.holders || b.totalValue - a.totalValue)
      .slice(0, 4)
      .map((h) => ({
        title: h.title,
        outcome: h.outcome,
        holders: h.holders,
        pctOfField: h.pctOfField,
        totalValue: h.totalValue,
        currentPrice: h.currentPrice,
        category: h.category,
        slug: h.slug,
        marketSlug: h.marketSlug ?? null,
      })),
  };
}

/**
 * Polymarket's short-window profit boards (today / this week / this month),
 * cached for minutes. These are "who is hot", not "who is good": the scan's
 * cohort is the ALL-time board, and the UI says which hot traders are also on it.
 * A failed fetch returns an empty board rather than breaking the page.
 */
export async function getHotTradersCached(period: Exclude<LeaderboardPeriod, "ALL">, limit = 12): Promise<LeaderEntry[]> {
  "use cache";
  cacheLife("minutes");
  try {
    return await fetchLeaderboard(limit, period);
  } catch {
    return [];
  }
}
