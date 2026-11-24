import { cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { getFeaturedMarkets } from "@/lib/data/markets";
import { getWhaleWatch, type ConsensusHolding } from "@/lib/whales";
import { freePreviewTokens, isInPlay, splitSides } from "@/lib/intel";
import { CHANNEL_DELAY_MS } from "@/lib/smart-alerts-core";
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
  /** When this view was read, so pages can compare dates without reading the clock during a prerender. */
  readAt: number;
}

/**
 * The public signal ledger, cached for a few minutes. Anonymous traffic lands
 * on this page straight from the nav, and it runs seven aggregate queries, so
 * it must not hit Postgres per view. Minutes is the right window: the scan that
 * feeds it runs hourly.
 */
export async function getTrackRecordCached(): Promise<TrackRecordView> {
  "use cache";
  cacheLife("minutes");
  const [record, byKind, ledger] = await Promise.all([getSignalRecord(), getRecordByKind(), getLedger({ openLimit: 40, settledLimit: 40 })]);
  return { record, byKind, open: ledger.open, settled: ledger.settled, readAt: Date.now() };
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
  /** The biggest clear agreements still in play (no split markets), picked as the app's Home picks its hero. */
  signals: ConsensusHolding[];
  /** Outcomes a Free member can open (split markets count both sides); the rest of the signals are Pro. */
  freeTokenCount: number;
  topTraders: Array<{ wallet: string; name: string; rank: number; pnl: number }>;
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
  const free = freePreviewTokens(p.holdings, CONSENSUS_MIN_WALLETS);
  return {
    generatedAt: p.generatedAt,
    trackedWallets: p.tradersScanned,
    positionsAnalyzed: p.positionsScanned,
    consensusOutcomes: consensus.length,
    consensusCapped: consensus.length > 0 && consensus.length === p.holdings.length,
    consensusCapital: consensus.reduce((sum, h) => sum + h.totalValue, 0),
    freeTokenCount: free.size,
    signals: (() => {
      const split = splitSides(p.holdings, CONSENSUS_MIN_WALLETS);
      return consensus.filter((h) => isInPlay(h) && !split.has(h.conditionId)).sort((a, b) => b.totalValue - a.totalValue).slice(0, 3);
    })(),
    topTraders: [...(p.wallets ?? [])]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6)
      .map((w) => ({ wallet: w.wallet, name: w.name, rank: w.rank, pnl: w.pnl })),
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

export interface PublicMove {
  id: string;
  wallet: string;
  traderName: string;
  rank: number;
  side: string;
  outcome: string;
  title: string;
  usd: number;
  avgPrice: number;
  lastTradeAt: string;
  eventSlug: string | null;
  marketSlug: string | null;
}

/** Public pages show big moves at least this big. */
const PUBLIC_MOVE_MIN_USD = 10_000;

/**
 * Recent big moves by the tracked top traders for public pages: one per
 * trader, $10K+, from markets still in play, and only once they are
 * CHANNEL_DELAY_MS old, the same delay as the free Telegram channel. Pro
 * members are alerted first; this is the free, delayed view of the same feed.
 */
export async function getPublicBigMovesCached(limit = 8): Promise<PublicMove[]> {
  "use cache";
  cacheLife("minutes");
  const now = Date.now();
  const rows = await db.smartAlert.findMany({
    where: { lastTradeAt: { lte: new Date(now - CHANNEL_DELAY_MS), gte: new Date(now - 24 * 3_600_000) }, usd: { gte: PUBLIC_MOVE_MIN_USD }, rank: { not: null } },
    orderBy: { lastTradeAt: "desc" },
    take: 80,
    select: { id: true, wallet: true, traderName: true, rank: true, side: true, outcome: true, title: true, usd: true, avgPrice: true, lastTradeAt: true, eventSlug: true, marketSlug: true },
  });
  const seen = new Set<string>();
  const out: PublicMove[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    if (seen.has(r.wallet) || r.avgPrice <= 0.03 || r.avgPrice >= 0.97) continue;
    seen.add(r.wallet);
    out.push({ ...r, rank: r.rank ?? 0, lastTradeAt: r.lastTradeAt.toISOString() });
  }
  return out;
}
