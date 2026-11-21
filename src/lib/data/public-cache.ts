import { cacheLife } from "next/cache";
import { getFeaturedMarkets } from "@/lib/data/markets";
import { getWhaleWatch } from "@/lib/whales";

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
      })),
  };
}
