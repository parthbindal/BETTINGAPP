/**
 * Whale Watch service. Builds a cached, aggregated view of what the most
 * profitable Polymarket wallets currently hold, where they overlap, and what
 * they have traded recently.
 *
 * Every input is public, verifiable Polymarket data: the profit leaderboard,
 * each wallet's live positions (with cost basis and entry times) and its recent
 * trades (with transaction hashes). A background job computes the aggregate and
 * stores it as a WhaleSnapshot, so pages read it instantly.
 *
 * Consensus is directional. A wallet holding both sides of one market counts
 * toward a side only when that side carries at least LEAN_SHARE of its money
 * there; evenly hedged wallets are excluded and reported separately, so market
 * makers cannot inflate agreement on both sides.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { fetchLeaderboard, fetchPositions, fetchRecentTrades, type LeaderEntry, type RawPosition } from "@/lib/data/providers/polymarket-whales";
import { logError } from "@/lib/ops";
// Safe despite signals.ts referencing ConsensusHolding: that direction is
// `import type`, so it is erased and there is no runtime cycle.
import { recordSignals } from "@/lib/signals";

/** Bump when the aggregation changes, so history never compares different methods. */
export const WHALE_METHOD = 2;
const POSITION_CONCURRENCY = 6;
const POSITION_PAUSE_MS = 120;
const KEEP_HOLDINGS = 120; // most-held outcomes stored
const MIN_HOLDERS = 2;
const LEAN_SHARE = 0.6;
const TOP_HOLDERS_KEPT = 25;
const RECENT_ENTRY_MS = 7 * 86_400_000;
const RECENT_TRADERS = 100; // best traders scanned for recent trades, clusters and similarity
const RECENT_TRADES_EACH = 500; // per trader; a trader at this cap is only covered back to its oldest trade
const RECENT_DAYS = 10;
const KEEP_MOVES = 600;
const MIN_TRADE_USD = 300; // ignore dust trades in the feed
const MIN_PICK_USD = 150; // a pick must be at least this to count toward similarity
const CLUSTER_WINDOW_MS = 72 * 3_600_000;
const KEEP_SNAPSHOTS = 5;

export interface ConsensusHolder {
  wallet: string;
  name: string;
  rank: number;
  value: number;
  entryAt: string | null; // this wallet's first entry into the outcome
}

export interface ConsensusHolding {
  tokenId: string;
  conditionId: string;
  title: string;
  outcome: string;
  category: string;
  holders: number; // tracked wallets leaning this side (hedged wallets excluded)
  pctOfField: number; // holders / tradersScanned
  totalValue: number; // USD those wallets hold on this side
  totalShares: number;
  avgEntry: number; // value-weighted average entry price
  currentPrice: number;
  unrealizedPnl: number;
  endDate: string | null;
  slug: string | null; // polymarket.com/event/<slug>
  marketSlug?: string | null; // added after method 2; older snapshots lack it
  // Added with method 2; absent on older snapshots.
  hedged?: number; // tracked wallets holding both sides of this market evenly
  firstEntry?: string | null;
  medianEntry?: string | null;
  lastEntry?: string | null;
  recentEntrants?: number; // holders whose first entry was in the last 7 days
  topHolderShare?: number; // largest single holder's share of totalValue, 0..1
  topHolders?: ConsensusHolder[]; // by value, at most TOP_HOLDERS_KEPT
}

export interface MarketNet {
  conditionId: string;
  question: string;
  category: string;
  sides: Array<{ outcome: string; holders: number; value: number }>;
  topOutcome: string;
  netValue: number; // value on the leading side minus the rest
  consensus: number; // leading side value / total value (0..1)
  totalValue: number;
}

export interface RecentMove {
  trader: string;
  wallet?: string;
  rank: number;
  tsIso: string;
  side: "BUY" | "SELL";
  outcome: string;
  title: string;
  usd: number;
  pricePct: number;
  category: string;
  eventSlug: string | null;
  marketSlug?: string | null;
  txHash?: string | null;
}

export interface SimilarPair {
  a: string;
  aRank: number;
  b: string;
  bRank: number;
  shared: number;
  markets: Array<{ title: string; outcome: string }>;
}

/** Real per-wallet figures from the scan, for the leaderboard and wallet pages. */
export interface WalletStat {
  wallet: string;
  name: string;
  rank: number;
  pnl: number; // leaderboard profit
  xUsername: string | null;
  verified: boolean;
  positions: number; // open positions of $100+
  openValue: number;
  openCost: number;
  unrealizedPnl: number;
  openRoi: number | null; // unrealizedPnl / openCost on open positions
  avgPosition: number;
  lastActive: string | null; // latest activity across open positions
  topCategory: string | null;
  scanned: boolean; // false when its positions could not be read this scan
}

/** Several tracked wallets buying the same outcome within CLUSTER_WINDOW_MS. */
export interface TradeCluster {
  tokenId: string;
  title: string;
  outcome: string;
  category: string;
  eventSlug: string | null;
  marketSlug?: string | null;
  wallets: Array<{ trader: string; wallet: string; rank: number; usd: number; tsIso: string }>;
  firstIso: string;
  lastIso: string;
  totalUsd: number;
}

export interface WhalePayload {
  method?: number;
  generatedAt: string;
  tradersScanned: number;
  positionsScanned: number;
  leaderboard: LeaderEntry[]; // top 50, kept for older readers
  holdings: ConsensusHolding[];
  marketNet: MarketNet[];
  categories: Array<{ category: string; holdings: number; value: number }>;
  recentMoves: RecentMove[];
  similarPairs: SimilarPair[];
  wallets?: WalletStat[];
  clusters?: TradeCluster[];
  recentWindowDays?: number;
  recentTraders?: number;
  /** Dollar volume per UTC day from every $300+ trade of the scanned traders. */
  dailyFlow?: Array<{ day: string; buys: number; sells: number; trades: number }>;
  /** Trades are complete from this time on; earlier days may be missing trades. */
  coverageFrom?: string;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
      if (POSITION_PAUSE_MS) await new Promise((r) => setTimeout(r, POSITION_PAUSE_MS));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

let syncInFlight: Promise<{ tradersScanned: number; positionsScanned: number; holdings: number }> | null = null;

/** True while a sync is running, so the UI can show it. */
export function isWhaleSyncRunning(): boolean {
  return syncInFlight !== null;
}

/** Pull the leaderboard, read every tracked wallet's positions and recent trades, aggregate, and store. Concurrent calls coalesce. */
export async function syncWhaleWatch(opts: { topN?: number } = {}): Promise<{ tradersScanned: number; positionsScanned: number; holdings: number }> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runWhaleSync(opts);
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function runWhaleSync(opts: { topN?: number }): Promise<{ tradersScanned: number; positionsScanned: number; holdings: number }> {
  const topN = Math.min(1000, opts.topN ?? 1000);
  const leaders = await fetchLeaderboard(topN);
  if (!leaders.length) throw new Error("Polymarket leaderboard returned no traders");
  const leaderByWallet = new Map(leaders.map((l) => [l.wallet, l]));
  const now = Date.now();

  const fetched = await mapPool(leaders, POSITION_CONCURRENCY, async (l) => {
    try {
      return { ok: true, positions: await fetchPositions(l.wallet, 200) };
    } catch (e) {
      await logError("whales.positions", e, { wallet: l.wallet.slice(0, 10) });
      return { ok: false, positions: [] as RawPosition[] };
    }
  });

  interface Agg {
    conditionId: string;
    title: string;
    outcome: string;
    category: string;
    eventSlug: string | null;
    marketSlug: string | null;
    endDate: string | null;
    holders: Map<string, { value: number; entryAt: number | null }>;
    totalValue: number;
    totalShares: number;
    weightedEntry: number; // sum(avgPrice * value)
    currentPrice: number;
    unrealizedPnl: number;
  }
  const byToken = new Map<string, Agg>();
  const hedgedByToken = new Map<string, number>();
  const wallets: WalletStat[] = [];
  let positionsScanned = 0;

  leaders.forEach((l, i) => {
    const { ok, positions } = fetched[i]!;
    positionsScanned += positions.length;

    // Wallet figures over its whole open book.
    let openValue = 0;
    let openCost = 0;
    let unrealized = 0;
    let lastActive = 0;
    const byCategory = new Map<string, number>();
    for (const p of positions) {
      openValue += p.currentValue;
      openCost += p.totalCost;
      unrealized += p.unrealizedPnl;
      if (p.lastEventAt && p.lastEventAt > lastActive) lastActive = p.lastEventAt;
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.currentValue);
    }
    wallets.push({
      wallet: l.wallet,
      name: l.name,
      rank: l.rank,
      pnl: l.pnl,
      xUsername: l.xUsername,
      verified: l.verified,
      positions: positions.length,
      openValue,
      openCost,
      unrealizedPnl: unrealized,
      openRoi: openCost > 0 ? unrealized / openCost : null,
      avgPosition: positions.length ? openValue / positions.length : 0,
      lastActive: iso(lastActive || null),
      topCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      scanned: ok,
    });

    // Directional consensus: per market, keep only the side this wallet leans.
    const byMarket = new Map<string, RawPosition[]>();
    for (const p of positions) byMarket.set(p.conditionId, [...(byMarket.get(p.conditionId) ?? []), p]);
    for (const sides of byMarket.values()) {
      let lean: RawPosition | null = sides[0] ?? null;
      if (sides.length > 1) {
        const total = sides.reduce((s, p) => s + p.currentValue, 0);
        const top = sides.reduce((a, b) => (b.currentValue > a.currentValue ? b : a));
        if (total > 0 && top.currentValue / total >= LEAN_SHARE) {
          lean = top;
        } else {
          for (const p of sides) hedgedByToken.set(p.tokenId, (hedgedByToken.get(p.tokenId) ?? 0) + 1);
          lean = null;
        }
      }
      if (!lean) continue;
      const a: Agg = byToken.get(lean.tokenId) ?? {
        conditionId: lean.conditionId,
        title: lean.title,
        outcome: lean.outcome,
        category: lean.category,
        eventSlug: lean.eventSlug,
        marketSlug: lean.marketSlug,
        endDate: lean.endDate,
        holders: new Map(),
        totalValue: 0,
        totalShares: 0,
        weightedEntry: 0,
        currentPrice: lean.currentPrice,
        unrealizedPnl: 0,
      };
      a.holders.set(l.wallet, { value: lean.currentValue, entryAt: lean.firstEntryAt });
      a.totalValue += lean.currentValue;
      a.totalShares += lean.shares;
      a.weightedEntry += lean.avgPrice * lean.currentValue;
      a.unrealizedPnl += lean.unrealizedPnl;
      a.currentPrice = lean.currentPrice || a.currentPrice;
      byToken.set(lean.tokenId, a);
    }
  });

  const holdings: ConsensusHolding[] = [...byToken.entries()]
    .filter(([, a]) => a.holders.size >= MIN_HOLDERS)
    .sort(([, a], [, b]) => b.holders.size - a.holders.size || b.totalValue - a.totalValue)
    .slice(0, KEEP_HOLDINGS)
    .map(([tokenId, a]) => {
      const list = [...a.holders.entries()].map(([wallet, h]) => ({ wallet, ...h }));
      const entries = list.map((h) => h.entryAt).filter((t): t is number => t !== null);
      const byValue = [...list].sort((x, y) => y.value - x.value);
      return {
        tokenId,
        conditionId: a.conditionId,
        title: a.title,
        outcome: a.outcome || "?",
        category: a.category,
        holders: a.holders.size,
        pctOfField: a.holders.size / leaders.length,
        totalValue: a.totalValue,
        totalShares: a.totalShares,
        avgEntry: a.totalValue > 0 ? a.weightedEntry / a.totalValue : 0,
        currentPrice: a.currentPrice,
        unrealizedPnl: a.unrealizedPnl,
        endDate: a.endDate,
        slug: a.eventSlug,
        marketSlug: a.marketSlug,
        hedged: hedgedByToken.get(tokenId) ?? 0,
        firstEntry: entries.length ? iso(Math.min(...entries)) : null,
        medianEntry: entries.length ? iso(median(entries)) : null,
        lastEntry: entries.length ? iso(Math.max(...entries)) : null,
        recentEntrants: entries.filter((t) => now - t <= RECENT_ENTRY_MS).length,
        topHolderShare: a.totalValue > 0 && byValue[0] ? byValue[0].value / a.totalValue : 0,
        topHolders: byValue.slice(0, TOP_HOLDERS_KEPT).map((h) => {
          const l = leaderByWallet.get(h.wallet);
          return { wallet: h.wallet, name: l?.name ?? `${h.wallet.slice(0, 6)}…${h.wallet.slice(-4)}`, rank: l?.rank ?? 0, value: h.value, entryAt: iso(h.entryAt) };
        }),
      };
    });

  // Net positioning per market: which side the field leans, and whether it is split.
  const byCondition = new Map<string, { question: string; category: string; sides: Map<string, { holders: number; value: number }> }>();
  for (const h of holdings) {
    const c = byCondition.get(h.conditionId) ?? { question: h.title, category: h.category, sides: new Map() };
    const s = c.sides.get(h.outcome) ?? { holders: 0, value: 0 };
    s.holders += h.holders;
    s.value += h.totalValue;
    c.sides.set(h.outcome, s);
    byCondition.set(h.conditionId, c);
  }
  const marketNet: MarketNet[] = [...byCondition.entries()]
    .map(([conditionId, c]) => {
      const sides = [...c.sides.entries()].map(([outcome, s]) => ({ outcome, holders: s.holders, value: s.value })).sort((a, b) => b.value - a.value);
      const totalValue = sides.reduce((a, s) => a + s.value, 0);
      const top = sides[0]!;
      return { conditionId, question: c.question, category: c.category, sides, topOutcome: top.outcome, netValue: top.value - (totalValue - top.value), consensus: totalValue > 0 ? top.value / totalValue : 1, totalValue };
    })
    .sort((a, b) => b.totalValue - a.totalValue);

  const catMap = new Map<string, { holdings: number; value: number }>();
  for (const h of holdings) {
    const c = catMap.get(h.category) ?? { holdings: 0, value: 0 };
    c.holdings++;
    c.value += h.totalValue;
    catMap.set(h.category, c);
  }
  const categories = [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value);

  // ---- Recent trades of the best traders: feed, daily flow, clusters, similarity ----
  // The window runs over whole UTC days so every daily bucket is complete.
  const bestTraders = leaders.slice(0, RECENT_TRADERS);
  const windowStart = new Date(now - (RECENT_DAYS - 1) * 86_400_000);
  windowStart.setUTCHours(0, 0, 0, 0);
  const cutoff = Math.floor(windowStart.getTime() / 1000);
  let coverageFromSec = cutoff;
  const tradesByTrader = await mapPool(bestTraders, POSITION_CONCURRENCY, async (l) => {
    try {
      const trades = (await fetchRecentTrades(l.wallet, RECENT_TRADES_EACH, cutoff)).filter((t) => t.ts >= cutoff);
      // At the cap, this trader's history may be cut short: coverage starts at its oldest trade.
      if (trades.length >= RECENT_TRADES_EACH) coverageFromSec = Math.max(coverageFromSec, Math.min(...trades.map((t) => t.ts)));
      return trades;
    } catch (e) {
      await logError("whales.trades", e, { wallet: l.wallet.slice(0, 10) });
      return [];
    }
  });

  const dailyFlow = new Map<string, { buys: number; sells: number; trades: number }>();
  for (let d = 0; d < RECENT_DAYS; d++) dailyFlow.set(new Date(windowStart.getTime() + d * 86_400_000).toISOString().slice(0, 10), { buys: 0, sells: 0, trades: 0 });
  for (const trades of tradesByTrader) {
    for (const t of trades) {
      if (t.usd < MIN_TRADE_USD) continue;
      const b = dailyFlow.get(new Date(t.ts * 1000).toISOString().slice(0, 10));
      if (!b) continue;
      b.trades++;
      if (t.side === "BUY") b.buys += t.usd;
      else b.sells += t.usd;
    }
  }

  const recentMoves: RecentMove[] = [];
  const pickSets = new Map<string, { rank: number; picks: Map<string, { title: string; outcome: string }> }>();
  const buysByToken = new Map<string, { title: string; outcome: string; category: string; eventSlug: string | null; marketSlug: string | null; buys: Array<{ trader: string; wallet: string; rank: number; usd: number; ts: number }> }>();
  bestTraders.forEach((l, idx) => {
    const trades = tradesByTrader[idx] ?? [];
    const picks = new Map<string, { title: string; outcome: string }>();
    for (const t of trades) {
      if (t.usd >= MIN_TRADE_USD) {
        recentMoves.push({ trader: l.name, wallet: l.wallet, rank: l.rank, tsIso: new Date(t.ts * 1000).toISOString(), side: t.side, outcome: t.outcome, title: t.title, usd: t.usd, pricePct: Math.round(t.price * 100), category: t.category, eventSlug: t.eventSlug || null, marketSlug: t.marketSlug, txHash: t.txHash });
        if (t.side === "BUY" && t.tokenId) {
          const b = buysByToken.get(t.tokenId) ?? { title: t.title, outcome: t.outcome, category: t.category, eventSlug: t.eventSlug || null, marketSlug: t.marketSlug, buys: [] };
          b.buys.push({ trader: l.name, wallet: l.wallet, rank: l.rank, usd: t.usd, ts: t.ts * 1000 });
          buysByToken.set(t.tokenId, b);
        }
      }
      // a "pick" = an exact side (token) they recently took a meaningful BUY in
      if (t.side === "BUY" && t.usd >= MIN_PICK_USD && t.tokenId) picks.set(t.tokenId, { title: t.title, outcome: t.outcome });
    }
    pickSets.set(l.wallet, { rank: l.rank, picks });
  });
  recentMoves.sort((a, b) => b.tsIso.localeCompare(a.tsIso));

  // Clusters: for each outcome, the window of CLUSTER_WINDOW_MS holding the most distinct tracked buyers.
  const clusters: TradeCluster[] = [];
  for (const [tokenId, b] of buysByToken) {
    const buys = [...b.buys].sort((x, y) => x.ts - y.ts);
    let best: typeof buys = [];
    let bestDistinct = 0;
    let lo = 0;
    for (let hi = 0; hi < buys.length; hi++) {
      while (buys[hi]!.ts - buys[lo]!.ts > CLUSTER_WINDOW_MS) lo++;
      const window = buys.slice(lo, hi + 1);
      const distinct = new Set(window.map((x) => x.wallet)).size;
      if (distinct > bestDistinct) {
        best = window;
        bestDistinct = distinct;
      }
    }
    if (bestDistinct < 2) continue;
    const byWallet = new Map<string, { trader: string; wallet: string; rank: number; usd: number; ts: number }>();
    for (const x of best) {
      const w = byWallet.get(x.wallet);
      if (w) w.usd += x.usd;
      else byWallet.set(x.wallet, { ...x });
    }
    const ws = [...byWallet.values()].sort((x, y) => x.ts - y.ts);
    clusters.push({
      tokenId,
      title: b.title,
      outcome: b.outcome,
      category: b.category,
      eventSlug: b.eventSlug,
      marketSlug: b.marketSlug,
      wallets: ws.map((w) => ({ trader: w.trader, wallet: w.wallet, rank: w.rank, usd: w.usd, tsIso: new Date(w.ts).toISOString() })),
      firstIso: new Date(ws[0]!.ts).toISOString(),
      lastIso: new Date(ws[ws.length - 1]!.ts).toISOString(),
      totalUsd: ws.reduce((s, w) => s + w.usd, 0),
    });
  }
  clusters.sort((a, b) => b.wallets.length - a.wallets.length || b.lastIso.localeCompare(a.lastIso));

  // Pairwise overlap of recent exact picks between the best traders.
  const pairs: SimilarPair[] = [];
  const entries = bestTraders.map((l) => ({ name: l.name, rank: l.rank, set: pickSets.get(l.wallet)?.picks ?? new Map<string, { title: string; outcome: string }>() })).filter((e) => e.set.size > 0);
  for (let a = 0; a < entries.length; a++) {
    for (let b = a + 1; b < entries.length; b++) {
      const A = entries[a]!;
      const B = entries[b]!;
      const shared: Array<{ title: string; outcome: string }> = [];
      for (const [token, info] of A.set) if (B.set.has(token)) shared.push(info);
      if (shared.length >= 2) pairs.push({ a: A.name, aRank: A.rank, b: B.name, bRank: B.rank, shared: shared.length, markets: shared.slice(0, 5) });
    }
  }
  pairs.sort((x, y) => y.shared - x.shared);

  const payload: WhalePayload = {
    method: WHALE_METHOD,
    generatedAt: new Date(now).toISOString(),
    tradersScanned: leaders.length,
    positionsScanned,
    leaderboard: leaders.slice(0, 50),
    wallets,
    holdings,
    marketNet,
    categories,
    recentMoves: recentMoves.slice(0, KEEP_MOVES),
    recentWindowDays: RECENT_DAYS,
    recentTraders: bestTraders.length,
    dailyFlow: [...dailyFlow.entries()].map(([day, v]) => ({ day, ...v })),
    coverageFrom: new Date(coverageFromSec * 1000).toISOString(),
    clusters: clusters.slice(0, 40),
    similarPairs: pairs.slice(0, 12),
  };

  await db.whaleSnapshot.create({ data: { tradersScanned: leaders.length, positionsScanned, payload: payload as unknown as Prisma.InputJsonValue } });
  const old = await db.whaleSnapshot.findMany({ orderBy: { generatedAt: "desc" }, skip: KEEP_SNAPSHOTS, select: { id: true } });
  if (old.length) await db.whaleSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  /*
   * Commit this scan's consensus to the permanent ledger. The snapshot above is
   * pruned to the last KEEP_SNAPSHOTS, so without this step every call we make
   * is deleted long before its market resolves and the product can never show
   * whether any of it worked. Recorded after the snapshot and swallowed on
   * failure: the ledger must never be the reason a scan is lost.
   */
  try {
    await recordSignals(holdings);
  } catch (e) {
    await logError("whales.recordSignals", e);
  }

  return { tradersScanned: leaders.length, positionsScanned, holdings: holdings.length };
}

export async function getWhaleWatch(): Promise<{ payload: WhalePayload; ageMs: number } | null> {
  const row = await db.whaleSnapshot.findFirst({ orderBy: { generatedAt: "desc" } });
  if (!row) return null;
  return { payload: row.payload as unknown as WhalePayload, ageMs: Date.now() - row.generatedAt.getTime() };
}

export interface WhaleHistoryPoint {
  generatedAt: string;
  positionsScanned: number;
  consensusOutcomes: number;
  consensusCapital: number;
  activeWallets: number;
  combinedOpenValue: number;
  combinedPnl: number;
}

/**
 * Headline figures from each stored scan made with the current method, oldest
 * first. Only same-method scans are compared, so a change in methodology never
 * shows up as a change in the market.
 */
export async function getWhaleHistory(minHolders: number): Promise<WhaleHistoryPoint[]> {
  const rows = await db.whaleSnapshot.findMany({ orderBy: { generatedAt: "asc" }, take: KEEP_SNAPSHOTS });
  return rows
    .map((r) => r.payload as unknown as WhalePayload)
    .filter((p) => p.method === WHALE_METHOD)
    .map((p) => {
      const c = p.holdings.filter((h) => h.holders >= minHolders);
      const ws = p.wallets ?? [];
      return {
        generatedAt: p.generatedAt,
        positionsScanned: p.positionsScanned,
        consensusOutcomes: c.length,
        consensusCapital: c.reduce((s, h) => s + h.totalValue, 0),
        activeWallets: ws.filter((w) => w.positions > 0).length,
        combinedOpenValue: ws.reduce((s, w) => s + w.openValue, 0),
        combinedPnl: ws.reduce((s, w) => s + w.pnl, 0),
      };
    });
}
