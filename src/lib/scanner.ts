/**
 * Opportunity scanner: surfaces analytical situations worth researching.
 * Deliberately conservative: low-confidence and demo situations are labeled,
 * fees and spread are netted, and nothing is ever called a "winner".
 */
import { db } from "@/lib/db";
import { listMarkets, getCategoryCounts } from "@/lib/data/markets";
import * as kalshi from "@/lib/data/providers/kalshi";
import { runMarketModel, type MarketModelResult } from "@/lib/analytics/market-model";
import type { Candle, NormalizedMarket } from "@/lib/data/types";
import { withProvider } from "@/lib/ops";
import { analyzePlayerProjection, statLabel } from "@/lib/data/sports";
import type { PlanLimits } from "@/lib/subscriptions/plans";

const candleCache = new Map<string, { at: number; candles: Candle[] }>();
const CANDLE_TTL = 10 * 60_000;
const MAX_LIVE_FETCHES = 16;
const FETCH_CONCURRENCY = 4; // the provider client also spaces requests
const MAX_PER_EVENT = 2; // one busy event must not flood the table

export type ScanSignal = "model_gap" | "big_move" | "closing_soon" | "projection_gap" | "data_quality";

export const SIGNAL_LABELS: Record<ScanSignal, string> = {
  model_gap: "Model vs market gap",
  big_move: "Significant move",
  closing_soon: "Closing soon",
  projection_gap: "Projection vs history",
  data_quality: "Data-quality warning",
};

export interface ScanResult {
  id: string;
  kind: "market" | "projection";
  title: string;
  subtitle: string | null;
  href: string;
  category: string;
  current: number | null;
  estimate: number | null;
  diffPts: number | null;
  confidence: "low" | "medium" | "high";
  freshness: string;
  fetchedAt: string;
  isDemo: boolean;
  explanation: string;
  risks: string[];
  closeTime: string | null;
  signal: ScanSignal;
  /** Groups rows that belong to one event or game, for de-duplication. */
  eventKey: string;
}

export interface ScanFilters {
  category?: string;
  sport?: string;
  minConfidence?: "low" | "medium" | "high";
  includeDemo?: boolean;
  maxDays?: number;
  minDiffPts?: number;
  signal?: ScanSignal;
}

const rank = { low: 0, medium: 1, high: 2 } as const;

async function snapshotCandles(ticker: string): Promise<Candle[] | null> {
  const snaps = await db.marketSnapshot.findMany({ where: { ticker }, orderBy: { ts: "asc" }, take: 60 });
  if (snaps.length < 5) return null;
  return snaps.map((s) => ({
    ts: Math.floor(s.ts.getTime() / 1000),
    open: null,
    high: null,
    low: null,
    close: s.yesBid !== null && s.yesAsk !== null ? (s.yesBid + s.yesAsk) / 2 : s.lastPrice,
    mean: null,
    yesBidClose: s.yesBid,
    yesAskClose: s.yesAsk,
    volume: s.volume ?? 0,
    openInterest: s.openInterest ?? 0,
  }));
}

/** Resolve history for each candidate: memory cache, then our own snapshots, then a bounded number of live fetches. */
async function loadCandles(markets: NormalizedMarket[]): Promise<Map<string, Candle[]>> {
  const out = new Map<string, Candle[]>();
  const needLive: NormalizedMarket[] = [];
  for (const m of markets) {
    const cached = candleCache.get(m.ticker);
    if (cached && Date.now() - cached.at < CANDLE_TTL) {
      out.set(m.ticker, cached.candles);
      continue;
    }
    const own = await snapshotCandles(m.ticker);
    if (own) {
      candleCache.set(m.ticker, { at: Date.now(), candles: own });
      out.set(m.ticker, own);
    } else {
      needLive.push(m);
    }
  }
  const batch = needLive.slice(0, MAX_LIVE_FETCHES);
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < batch.length; i += FETCH_CONCURRENCY) {
    await Promise.all(
      batch.slice(i, i + FETCH_CONCURRENCY).map(async (m) => {
        const candles = await withProvider("kalshi", () => kalshi.fetchCandles(m.seriesTicker, m.ticker, now - 14 * 86400, now, 1440)).catch(() => [] as Candle[]);
        candleCache.set(m.ticker, { at: Date.now(), candles });
        out.set(m.ticker, candles);
      }),
    );
  }
  for (const m of needLive.slice(MAX_LIVE_FETCHES)) out.set(m.ticker, []);
  return out;
}

/**
 * Candidate markets. Without a category filter, sample the most active markets
 * from each active category rather than the global top-N, which on a busy
 * sports day would be nothing but game lines.
 */
async function pickCandidates(limits: PlanLimits, filters: ScanFilters): Promise<NormalizedMarket[]> {
  const total = limits.scannerAdvancedFilters ? 120 : 60;
  if (filters.category) return (await listMarkets({ category: filters.category, sort: "volume24h", limit: total, minVolume: 100, withTotal: false })).items;
  const cats = (await getCategoryCounts()).filter((c) => c.volume24h > 0).slice(0, 10);
  if (!cats.length) return [];
  const per = Math.max(6, Math.ceil(total / cats.length));
  const lists = await Promise.all(cats.map((c) => listMarkets({ category: c.category, sort: "volume24h", limit: per, minVolume: 100, withTotal: false })));
  return lists.flatMap((l) => l.items);
}

export async function runScanner(limits: PlanLimits, filters: ScanFilters = {}): Promise<{ results: ScanResult[]; scanned: number; projectionsScanned: number; generatedAt: string }> {
  const results: ScanResult[] = [];

  // ---- Markets: liquid, undecided, within the date window ----
  const sportsOnly = Boolean(filters.sport);
  let scanned = 0;
  if (!sportsOnly) {
    const items = await pickCandidates(limits, filters);
    const horizon = filters.maxDays ? Date.now() + filters.maxDays * 86400_000 : null;
    const candidates = items.filter((m) => m.lastPrice !== null && m.lastPrice > 0.04 && m.lastPrice < 0.96 && (!horizon || !m.closeTime || new Date(m.closeTime).getTime() <= horizon));
    scanned = candidates.length;
    const candleMap = await loadCandles(candidates);
    for (const m of candidates) {
      const model: MarketModelResult = runMarketModel(m, candleMap.get(m.ticker) ?? []);
      const delta = m.lastPrice !== null && m.previousPrice !== null ? m.lastPrice - m.previousPrice : null;
      const hoursToClose = m.closeTime ? (new Date(m.closeTime).getTime() - Date.now()) / 3600_000 : null;
      const base = {
        kind: "market" as const,
        title: m.title,
        subtitle: m.yesSubTitle,
        href: `/markets/${m.ticker}`,
        category: m.category,
        freshness: m.provenance.freshness,
        fetchedAt: m.provenance.fetchedAt,
        isDemo: false,
        closeTime: m.closeTime,
        eventKey: m.eventTicker,
        current: model.marketProb,
        estimate: model.estimate,
        confidence: model.confidence,
      };
      if (model.noteworthy && model.diffPts !== null) {
        results.push({
          ...base,
          id: `gap-${m.ticker}`,
          signal: "model_gap",
          diffPts: model.diffPts,
          explanation: `The heuristic model estimate differs from the market by ${(model.diffPts * 100).toFixed(1)} pts (${((model.netOfFeesDiff ?? 0) * 100).toFixed(1)} after approximate fees). ${model.explanation[1] ?? ""}`.trim(),
          risks: model.caveats.slice(0, 3),
        });
      }
      if (delta !== null && Math.abs(delta) >= 0.08 && m.volume24h >= 500) {
        results.push({
          ...base,
          id: `move-${m.ticker}`,
          signal: "big_move",
          diffPts: delta,
          explanation: `Price moved ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)} pts from the previous reference price on ${Math.round(m.volume24h).toLocaleString()} contracts of 24h volume. Large moves usually follow new information; identify it before forming a view.`,
          risks: ["Moves after news often overshoot and partly revert.", "The previous reference price can be stale in thin markets."],
        });
      }
      if (hoursToClose !== null && hoursToClose > 0 && hoursToClose <= 48 && m.volume24h >= 1000) {
        results.push({
          ...base,
          id: `close-${m.ticker}`,
          signal: "closing_soon",
          diffPts: null,
          explanation: `Trading closes in ${hoursToClose < 24 ? `${Math.max(1, Math.round(hoursToClose))} hours` : `${(hoursToClose / 24).toFixed(1)} days`} with active volume. Final-session prices tend to incorporate the most information; compare early and late prices in the history view.`,
          risks: ["Late price moves can reflect information you do not have.", "Spreads often widen near the close."],
        });
      }
      if (model.inputs.spread !== null && model.inputs.spread >= 0.1 && m.volume24h >= 200) {
        results.push({
          ...base,
          id: `dq-${m.ticker}`,
          signal: "data_quality",
          diffPts: null,
          confidence: "low",
          explanation: `The bid–ask spread is ${(model.inputs.spread * 100).toFixed(0)}¢, so the market's implied probability is poorly defined. Any single price quote here overstates precision.`,
          risks: ["Wide spreads mean high transaction costs and an uncertain consensus."],
        });
      }
    }
  }

  // ---- Sports projections (demo-labeled when applicable) ----
  let projectionsScanned = 0;
  if (!filters.category || filters.category === "Sports") {
    const projections = await db.projection.findMany({
      where: { game: { status: "scheduled", startsAt: { gte: new Date(Date.now() - 3600_000) } }, ...(filters.sport ? { player: { sport: filters.sport } } : {}) },
      include: { player: { include: { team: true } }, game: true },
      take: limits.scannerAdvancedFilters ? 80 : 40,
      orderBy: { game: { startsAt: "asc" } },
    });
    projectionsScanned = projections.length;
    for (const p of projections) {
      const r = await analyzePlayerProjection(p.playerId, p.stat, p.line, { window: 40 });
      if (!r) continue;
      const est = r.analysis.estimate;
      const gap = est.probOver - 0.5;
      if (Math.abs(gap) >= 0.12 && est.confidence !== "low") {
        results.push({
          id: `proj-${p.id}`,
          kind: "projection",
          signal: "projection_gap",
          title: `${p.player.name} · ${statLabel(p.player.sport, p.stat)} ${p.line}`,
          subtitle: `${p.player.team.name} · ${p.player.position}`,
          href: `/sports/players/${p.playerId}?stat=${p.stat}&line=${p.line}`,
          category: "Sports",
          current: 0.5,
          estimate: est.probOver,
          diffPts: gap,
          confidence: est.confidence,
          freshness: p.isDemo ? "demo" : "delayed",
          fetchedAt: p.fetchedAt.toISOString(),
          isDemo: p.isDemo,
          closeTime: p.game.startsAt.toISOString(),
          eventKey: `${p.gameId}:${p.playerId}`,
          explanation: `Blended estimate P(over) is ${(est.probOver * 100).toFixed(0)}% against a line treated as a 50% reference, over ${r.analysis.sampleSize} games (mean ${r.analysis.windows.season.mean.toFixed(1)}, σ ${est.sd.toFixed(1)}).${p.isDemo ? " DEMO data: fictional player and statistics." : ""}`,
          risks: r.analysis.flags.map((f) => f.text).slice(0, 3),
        });
      }
    }
  }

  let out = results;
  if (filters.minConfidence) out = out.filter((r) => rank[r.confidence] >= rank[filters.minConfidence!]);
  if (!filters.includeDemo) out = out.filter((r) => !r.isDemo);
  if (filters.minDiffPts) out = out.filter((r) => r.diffPts === null || Math.abs(r.diffPts) >= filters.minDiffPts! / 100);
  if (filters.signal) out = out.filter((r) => r.signal === filters.signal);
  out.sort((a, b) => rank[b.confidence] - rank[a.confidence] || Math.abs(b.diffPts ?? 0) - Math.abs(a.diffPts ?? 0));
  // Keep the strongest few rows per event and signal.
  const perEvent = new Map<string, number>();
  out = out.filter((r) => {
    const k = `${r.signal}:${r.eventKey}`;
    const n = (perEvent.get(k) ?? 0) + 1;
    perEvent.set(k, n);
    return n <= MAX_PER_EVENT;
  });
  return { results: out, scanned, projectionsScanned, generatedAt: new Date().toISOString() };
}
