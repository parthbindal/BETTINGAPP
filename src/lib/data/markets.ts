/**
 * Prediction-market service layer over the provider cache.
 *
 * Kalshi lists roughly 170,000 open markets, most of which never trade, in an
 * order unrelated to activity. Three sync paths keep the cache useful:
 *
 *  - syncMarkets()        full scan of the open feed; persists only markets
 *                         with real activity, writes only rows that changed,
 *                         and closes markets that left the feed. ~1 minute.
 *  - refreshHotMarkets()  re-quotes the most liquid and all watched markets
 *                         in a handful of batched requests. Seconds.
 *  - bootstrapMarkets()   first-run only: seeds the cache from whatever is
 *                         trading right now so the app is useful immediately.
 *
 * Detail pages always re-quote their own market when the cached row is stale.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import * as kalshi from "@/lib/data/providers/kalshi";
import type { Candle, NormalizedEvent, NormalizedMarket, Trade, SeriesInfo } from "@/lib/data/types";
import { config } from "@/lib/env";
import { logError, withProvider } from "@/lib/ops";
import { runMarketModel, summarizeMovement, type MarketModelResult } from "@/lib/analytics/market-model";

const DETAIL_STALE_MS = 2 * 60_000;
export const OPEN_STATUSES = ["active", "open", "initialized"];

/**
 * Kalshi keeps a market "active" until it settles, often days after a game has
 * ended, and stored statuses only refresh with the full sync. So "open" is not
 * "still in play". A market whose close time has passed, or whose last price
 * sits at 3¢ or below or 97¢ or above, is decided in all but name: the same
 * line the rest of the app draws (isInPlay in lib/intel). Browse views leave
 * those out; a search still finds them.
 */
export function inPlayWhere(now = new Date()): Prisma.MarketWhereInput {
  return {
    AND: [{ OR: [{ closeTime: null }, { closeTime: { gte: now } }] }, { OR: [{ lastPrice: null }, { lastPrice: { gt: 0.03, lt: 0.97 } }] }],
  };
}
export const FULL_SCAN_KEY = "kalshi:full-scan";
export const HOT_REFRESH_KEY = "kalshi:hot-refresh";
const SNAPSHOT_MIN_VOLUME_24H = 500;
const SNAPSHOT_TOP_N = 400;
const SNAPSHOT_RETENTION_DAYS = 30;
const HOT_TOP_N = 300;
const BOOTSTRAP_EVENTS = 24;

/** Case-insensitive `contains` on Postgres; SQLite's LIKE already ignores ASCII case. */
export const insensitive = (config.isPostgres ? { mode: "insensitive" } : {}) as object;

type DbMarket = Prisma.MarketGetPayload<{ include: { event: true } }>;

interface QuoteLike {
  status: string;
  yesBid: number | null;
  yesAsk: number | null;
  lastPrice: number | null;
  previousPrice: number | null;
  volume: number;
  volume24h: number;
  openInterest: number;
  result: string | null;
}

export function toNormalized(m: DbMarket): NormalizedMarket {
  const ageMs = Date.now() - m.fetchedAt.getTime();
  const open = OPEN_STATUSES.includes(m.status);
  return {
    ticker: m.ticker,
    eventTicker: m.eventTicker,
    seriesTicker: m.seriesTicker,
    title: m.title,
    subtitle: m.subtitle,
    yesSubTitle: m.yesSubTitle,
    category: m.category,
    status: m.status,
    yesBid: m.yesBid,
    yesAsk: m.yesAsk,
    lastPrice: m.lastPrice,
    previousPrice: m.previousPrice,
    volume: m.volume,
    volume24h: m.volume24h,
    openInterest: m.openInterest,
    openTime: m.openTime?.toISOString() ?? null,
    closeTime: m.closeTime?.toISOString() ?? null,
    expirationTime: m.expirationTime?.toISOString() ?? null,
    rulesPrimary: m.rulesPrimary,
    rulesSecondary: m.rulesSecondary,
    result: m.result,
    provenance: {
      source: m.source,
      freshness: m.source === "demo" ? "demo" : !open ? "historical" : ageMs > DETAIL_STALE_MS ? "delayed" : "live",
      fetchedAt: m.fetchedAt.toISOString(),
      note: !open ? "Market is no longer open" : ageMs > DETAIL_STALE_MS ? `Cached ${Math.round(ageMs / 60000)} min ago` : undefined,
    },
  };
}

// ───────────────────────── persistence helpers ─────────────────────────

const signature = (q: QuoteLike) => `${q.status}|${q.yesBid}|${q.yesAsk}|${q.lastPrice}|${q.previousPrice}|${q.volume}|${q.volume24h}|${q.openInterest}|${q.result ?? ""}`;

/**
 * Write fresh quotes as independent row updates, ten at a time. Each quote is
 * its own fact, so there is nothing to keep atomic; a 100-row interactive
 * transaction against a networked Postgres ran past Prisma's 5s limit and
 * rolled back the whole batch.
 */
async function applyQuotes(markets: NormalizedMarket[], at: Date): Promise<void> {
  for (let i = 0; i < markets.length; i += 10) {
    await Promise.all(markets.slice(i, i + 10).map((m) => db.market.update({ where: { ticker: m.ticker }, data: quoteData(m, at) })));
  }
}

function quoteData(m: NormalizedMarket, at: Date) {
  return {
    status: m.status,
    yesBid: m.yesBid,
    yesAsk: m.yesAsk,
    lastPrice: m.lastPrice,
    previousPrice: m.previousPrice,
    volume: m.volume,
    volume24h: m.volume24h,
    openInterest: m.openInterest,
    result: m.result,
    fetchedAt: at,
  };
}

function marketRow(m: NormalizedMarket, at: Date): Prisma.MarketCreateManyInput {
  return {
    ticker: m.ticker,
    eventTicker: m.eventTicker,
    seriesTicker: m.seriesTicker,
    title: m.title,
    subtitle: m.subtitle,
    yesSubTitle: m.yesSubTitle,
    category: m.category,
    openTime: m.openTime ? new Date(m.openTime) : null,
    closeTime: m.closeTime ? new Date(m.closeTime) : null,
    expirationTime: m.expirationTime ? new Date(m.expirationTime) : null,
    rulesPrimary: m.rulesPrimary,
    rulesSecondary: m.rulesSecondary,
    source: m.provenance.source,
    freshness: "live",
    ...quoteData(m, at),
  };
}

function eventRow(ev: NormalizedEvent, at: Date): Prisma.MarketEventCreateManyInput {
  return {
    eventTicker: ev.eventTicker,
    seriesTicker: ev.seriesTicker,
    title: ev.title,
    subTitle: ev.subTitle,
    category: ev.category,
    mutuallyExclusive: ev.mutuallyExclusive,
    settlementSources: ev.settlementSources as unknown as Prisma.InputJsonValue,
    fetchedAt: at,
  };
}

function snapshotRow(m: NormalizedMarket, at: Date): Prisma.MarketSnapshotCreateManyInput {
  return { ticker: m.ticker, ts: at, yesBid: m.yesBid, yesAsk: m.yesAsk, lastPrice: m.lastPrice, volume: m.volume, openInterest: m.openInterest };
}

async function upsertEvent(ev: NormalizedEvent) {
  const { eventTicker, ...rest } = eventRow(ev, new Date(ev.provenance.fetchedAt));
  await db.marketEvent.upsert({ where: { eventTicker }, create: { eventTicker, ...rest }, update: rest });
}

async function upsertMarket(m: NormalizedMarket, snapshot: boolean) {
  const at = new Date(m.provenance.fetchedAt);
  const { ticker, eventTicker, ...rest } = marketRow(m, at);
  await db.market.upsert({ where: { ticker }, create: { ticker, eventTicker, ...rest }, update: rest });
  if (snapshot) await db.marketSnapshot.create({ data: snapshotRow(m, at) });
}

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** A market is worth caching once it has ever traded or holds open interest. */
const hasActivity = (m: NormalizedMarket) => m.volume > 0 || m.openInterest > 0;

async function recordSyncState(key: string, ok: boolean, ms: number, note?: string) {
  const now = new Date();
  await db.providerHealth
    .upsert({
      where: { provider: key },
      create: { provider: key, status: ok ? "ok" : "degraded", lastSuccessAt: ok ? now : null, lastErrorAt: ok ? null : now, lastError: note ?? null, latencyMs: ms },
      update: ok ? { status: "ok", lastSuccessAt: now, lastError: note ?? null, latencyMs: ms } : { status: "degraded", lastErrorAt: now, lastError: note ?? null, latencyMs: ms },
    })
    .catch(() => {});
}

export async function getSyncState() {
  const rows = await db.providerHealth.findMany({ where: { provider: { in: [FULL_SCAN_KEY, HOT_REFRESH_KEY] } } });
  return {
    lastFullScanAt: rows.find((r) => r.provider === FULL_SCAN_KEY)?.lastSuccessAt ?? null,
    lastHotRefreshAt: rows.find((r) => r.provider === HOT_REFRESH_KEY)?.lastSuccessAt ?? null,
  };
}

// ───────────────────────── full scan ─────────────────────────

export interface SyncResult {
  complete: boolean;
  pages: number;
  eventsWithActivity: number;
  marketsSeen: number;
  created: number;
  updated: number;
  unchanged: number;
  closed: number;
  snapshots: number;
  ms: number;
}

let fullScanInFlight: Promise<SyncResult> | null = null;

/**
 * Walk the whole open-events feed. Only rows whose quote actually changed are
 * rewritten; unchanged rows just have their verification time bumped in bulk.
 * `maxPages` exists for tests; a partial scan never closes markets.
 */
export async function syncMarkets(opts: { maxPages?: number } = {}): Promise<SyncResult> {
  if (fullScanInFlight) return fullScanInFlight;
  fullScanInFlight = (async () => {
    const t0 = Date.now();
    const started = new Date();
    const res: SyncResult = { complete: false, pages: 0, eventsWithActivity: 0, marketsSeen: 0, created: 0, updated: 0, unchanged: 0, closed: 0, snapshots: 0, ms: 0 };
    try {
      const [existingRows, existingEventRows] = await Promise.all([
        db.market.findMany({
          where: { source: "kalshi" },
          select: { ticker: true, status: true, yesBid: true, yesAsk: true, lastPrice: true, previousPrice: true, volume: true, volume24h: true, openInterest: true, result: true },
        }),
        db.marketEvent.findMany({ select: { eventTicker: true } }),
      ]);
      const known = new Map(existingRows.map((r) => [r.ticker, signature(r)]));
      const knownEvents = new Set(existingEventRows.map((e) => e.eventTicker));
      const snapshotPool: NormalizedMarket[] = [];
      let cursor: string | null = null;

      for (;;) {
        const page: { events: NormalizedEvent[]; cursor: string | null } = await withProvider("kalshi", () => kalshi.fetchOpenEvents({ limit: 200, cursor: cursor ?? undefined }));
        res.pages++;
        const newEvents: Prisma.MarketEventCreateManyInput[] = [];
        const newMarkets: Prisma.MarketCreateManyInput[] = [];
        const changed: NormalizedMarket[] = [];
        const same: string[] = [];
        for (const ev of page.events) {
          // Keep anything with activity, plus anything already cached (e.g. opened directly by a user).
          const keep = ev.markets.filter((m) => hasActivity(m) || known.has(m.ticker));
          if (!keep.length) continue;
          res.eventsWithActivity++;
          if (!knownEvents.has(ev.eventTicker)) {
            newEvents.push(eventRow(ev, started));
            knownEvents.add(ev.eventTicker);
          }
          for (const m of keep) {
            res.marketsSeen++;
            const sig = signature(m);
            const prev = known.get(m.ticker);
            if (prev === undefined) {
              newMarkets.push(marketRow(m, started));
              known.set(m.ticker, sig);
            } else if (prev !== sig) {
              changed.push(m);
            } else {
              same.push(m.ticker);
            }
            if (m.volume24h >= SNAPSHOT_MIN_VOLUME_24H) snapshotPool.push(m);
          }
        }
        if (newEvents.length) await db.marketEvent.createMany({ data: newEvents });
        for (const part of chunk(newMarkets, 400)) await db.market.createMany({ data: part });
        await applyQuotes(changed, started);
        for (const part of chunk(same, 800)) await db.market.updateMany({ where: { ticker: { in: part } }, data: { fetchedAt: started } });
        res.created += newMarkets.length;
        res.updated += changed.length;
        res.unchanged += same.length;

        cursor = page.cursor;
        if (!cursor) {
          res.complete = true;
          break;
        }
        if (opts.maxPages && res.pages >= opts.maxPages) break;
      }

      if (res.complete) {
        // Anything still marked open that this scan did not verify has left the open feed.
        const closed = await db.market.updateMany({ where: { source: "kalshi", status: { in: OPEN_STATUSES }, fetchedAt: { lt: started } }, data: { status: "closed" } });
        res.closed = closed.count;
        // History for the most liquid markets, bounded so storage stays predictable.
        const top = snapshotPool.sort((a, b) => b.volume24h - a.volume24h).slice(0, SNAPSHOT_TOP_N);
        for (const part of chunk(top, 400)) await db.marketSnapshot.createMany({ data: part.map((m) => snapshotRow(m, started)) });
        res.snapshots = top.length;
        await db.marketSnapshot.deleteMany({ where: { ts: { lt: new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000) } } });
      }
      res.ms = Date.now() - t0;
      await recordSyncState(FULL_SCAN_KEY, res.complete, res.ms, res.complete ? `${res.marketsSeen} active markets` : `Stopped after ${res.pages} page(s)`);
    } catch (e) {
      res.ms = Date.now() - t0;
      await logError("markets.sync", e, { pages: res.pages });
      await recordSyncState(FULL_SCAN_KEY, false, res.ms, e instanceof Error ? e.message : String(e));
    }
    return res;
  })();
  try {
    return await fullScanInFlight;
  } finally {
    fullScanInFlight = null;
  }
}

// ───────────────────────── hot refresh ─────────────────────────

let hotInFlight: Promise<{ requested: number; refreshed: number; ms: number }> | null = null;

/** Re-quote the most liquid markets plus everything on a watchlist or awaiting resolution. */
export async function refreshHotMarkets(opts: { extraTickers?: string[] } = {}) {
  if (hotInFlight) return hotInFlight;
  hotInFlight = (async () => {
    const t0 = Date.now();
    let refreshed = 0;
    let requested = 0;
    try {
      const [top, watched, forecast] = await Promise.all([
        db.market.findMany({ where: { source: "kalshi", status: { in: OPEN_STATUSES } }, orderBy: { volume24h: "desc" }, take: HOT_TOP_N, select: { ticker: true } }),
        db.watchlistItem.findMany({ where: { kind: "market" }, distinct: ["refId"], select: { refId: true }, take: 400 }),
        db.prediction.findMany({ where: { domain: "market", outcome: null, resolutionSource: null }, distinct: ["refId"], select: { refId: true }, take: 200 }),
      ]);
      const tickers = [...new Set([...top.map((t) => t.ticker), ...watched.map((w) => w.refId), ...forecast.map((p) => p.refId), ...(opts.extraTickers ?? [])])];
      requested = tickers.length;
      const rows = await db.market.findMany({ where: { ticker: { in: tickers } }, select: { ticker: true, category: true, seriesTicker: true, event: { select: { title: true } } } });
      const meta = new Map<string, kalshi.EventMeta>(rows.map((r) => [r.ticker, { category: r.category, series_ticker: r.seriesTicker, title: r.event.title }]));
      for (const part of chunk([...meta.keys()], 100)) {
        const fresh = await withProvider("kalshi", () => kalshi.fetchMarketsByTickers(part, meta));
        const at = new Date();
        await applyQuotes(fresh, at);
        refreshed += fresh.length;
      }
      await recordSyncState(HOT_REFRESH_KEY, true, Date.now() - t0, `${refreshed} markets re-quoted`);
    } catch (e) {
      await logError("markets.hot", e);
      await recordSyncState(HOT_REFRESH_KEY, false, Date.now() - t0, e instanceof Error ? e.message : String(e));
    }
    return { requested, refreshed, ms: Date.now() - t0 };
  })();
  try {
    return await hotInFlight;
  } finally {
    hotInFlight = null;
  }
}

/** First run on an empty cache: load the events that are trading right now. */
export async function bootstrapMarkets(): Promise<{ events: number; markets: number }> {
  const recent = await withProvider("kalshi", () => kalshi.fetchRecentlyTradedTickers(1000));
  const ranked = await withProvider("kalshi", () => kalshi.fetchEventTickersFor(recent.slice(0, 100).map((r) => r.ticker)));
  let events = 0;
  let markets = 0;
  for (const { eventTicker } of ranked.slice(0, BOOTSTRAP_EVENTS)) {
    try {
      const ev = await withProvider("kalshi", () => kalshi.fetchEvent(eventTicker));
      const keep = ev.markets.filter(hasActivity);
      if (!keep.length) continue;
      await upsertEvent(ev);
      for (const m of keep) await upsertMarket(m, false);
      events++;
      markets += keep.length;
    } catch (e) {
      await logError("markets.bootstrap.event", e, { eventTicker });
    }
  }
  return { events, markets };
}

export async function lastSyncAt(): Promise<Date | null> {
  const row = await db.market.findFirst({ where: { source: "kalshi" }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } });
  return row?.fetchedAt ?? null;
}

// ───────────────────────── queries ─────────────────────────

export type MarketSort = "volume24h" | "volume" | "closing" | "movers" | "newest";

export interface ListMarketsParams {
  category?: string;
  q?: string;
  sort?: MarketSort;
  limit?: number;
  offset?: number;
  minVolume?: number;
  /** Skip the COUNT query when the caller does not paginate. */
  withTotal?: boolean;
  /** Leave out decided markets (see inPlayWhere). Defaults to true when browsing and false when searching. */
  inPlay?: boolean;
}

export async function listMarkets(params: ListMarketsParams) {
  const q = params.q?.trim();
  const where: Prisma.MarketWhereInput = {
    status: { in: OPEN_STATUSES },
    ...(params.category ? { category: params.category } : {}),
    ...(q ? { OR: [{ title: { contains: q, ...insensitive } }, { yesSubTitle: { contains: q, ...insensitive } }, { ticker: { contains: q.toUpperCase() } }, { eventTicker: { contains: q.toUpperCase() } }] } : {}),
    ...(params.minVolume ? { volume: { gte: params.minVolume } } : {}),
    ...(params.sort === "closing" ? { closeTime: { gte: new Date() } } : {}),
    ...((params.inPlay ?? !q) ? inPlayWhere() : {}),
  };
  const orderBy: Prisma.MarketOrderByWithRelationInput[] =
    params.sort === "closing" ? [{ closeTime: "asc" }] : params.sort === "newest" ? [{ openTime: "desc" }] : params.sort === "volume" ? [{ volume: "desc" }] : [{ volume24h: "desc" }, { volume: "desc" }];
  const moversPool = params.sort === "movers";
  const [rows, total] = await Promise.all([
    db.market.findMany({
      where: moversPool ? { ...where, volume24h: { gte: 100 }, NOT: { previousPrice: null } } : where,
      orderBy,
      take: moversPool ? 600 : (params.limit ?? 50),
      skip: moversPool ? 0 : (params.offset ?? 0),
      include: { event: true },
    }),
    params.withTotal === false ? Promise.resolve(0) : db.market.count({ where }),
  ]);
  let items = rows.map(toNormalized);
  if (moversPool) {
    // "Biggest moves" ranks the liquid pool by absolute change, then pages in memory.
    items = items
      .filter((m) => m.lastPrice !== null && m.previousPrice !== null)
      .sort((a, b) => Math.abs((b.lastPrice ?? 0) - (b.previousPrice ?? 0)) - Math.abs((a.lastPrice ?? 0) - (a.previousPrice ?? 0)))
      .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50));
    return { items, total: Math.min(total, rows.length) };
  }
  return { items, total };
}

/** Counts per category of markets still in play, so a chip's number matches the list it opens. */
export async function getCategoryCounts(): Promise<Array<{ category: string; count: number; volume24h: number }>> {
  const rows = await db.market.groupBy({
    by: ["category"],
    where: { status: { in: OPEN_STATUSES }, ...inPlayWhere() },
    _count: { _all: true },
    _sum: { volume24h: true },
  });
  return rows.map((r) => ({ category: r.category, count: r._count._all, volume24h: r._sum.volume24h ?? 0 })).sort((a, b) => b.volume24h - a.volume24h || b.count - a.count);
}

/**
 * Liquid, undecided markets for dashboards: one per event, then round-robin
 * across categories so a busy category (a full sports slate, say) cannot take
 * every slot.
 */
export async function getFeaturedMarkets(limit = 6): Promise<NormalizedMarket[]> {
  const rows = await db.market.findMany({
    where: { status: { in: OPEN_STATUSES }, volume24h: { gt: 0 }, lastPrice: { gte: 0.08, lte: 0.92 } },
    orderBy: [{ volume24h: "desc" }],
    take: 300,
    include: { event: true },
  });
  const seenEvents = new Set<string>();
  const byCategory = new Map<string, DbMarket[]>();
  for (const r of rows) {
    if (seenEvents.has(r.eventTicker)) continue;
    seenEvents.add(r.eventTicker);
    byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  }
  const out: NormalizedMarket[] = [];
  for (let depth = 0; out.length < limit; depth++) {
    let added = false;
    for (const list of byCategory.values()) {
      const r = list[depth];
      if (r && out.length < limit) {
        out.push(toNormalized(r));
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Largest changes versus the previous day's reference price among liquid, still-undecided markets (one per event). */
export async function getMarketMovers(limit = 8) {
  const rows = await db.market.findMany({
    where: { status: { in: OPEN_STATUSES }, volume24h: { gte: 500 }, lastPrice: { gte: 0.03, lte: 0.97 }, NOT: { previousPrice: null } },
    orderBy: { volume24h: "desc" },
    take: 500,
    include: { event: true },
  });
  const ranked = rows
    .map(toNormalized)
    .map((m) => ({ market: m, delta: (m.lastPrice ?? 0) - (m.previousPrice ?? 0) }))
    .filter((x) => Math.abs(x.delta) >= 0.02)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const seen = new Set<string>();
  const out: typeof ranked = [];
  for (const x of ranked) {
    if (seen.has(x.market.eventTicker)) continue;
    seen.add(x.market.eventTicker);
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

export interface MarketDetail {
  market: NormalizedMarket;
  event: { title: string; subTitle: string | null; mutuallyExclusive: boolean; settlementSources: Array<{ name: string; url?: string }> } | null;
  siblings: NormalizedMarket[];
  series: SeriesInfo | null;
  candles: Candle[];
  candlePeriod: "hourly" | "daily";
  historyDays: number;
  trades: Trade[];
  model: MarketModelResult;
  movement: ReturnType<typeof summarizeMovement>;
  ownSnapshots: Array<{ ts: string; mid: number | null }>;
}

/**
 * Full market view. Re-quotes the market when the cached row is stale, pulls
 * candle history for the plan-allowed window, and runs the heuristic model
 * (each estimate is persisted so later scoring can audit it).
 */
export async function getMarketDetail(ticker: string, historyDays: number): Promise<MarketDetail | null> {
  let row = await db.market.findUnique({ where: { ticker }, include: { event: true } });
  const stale = !row || Date.now() - row.fetchedAt.getTime() > DETAIL_STALE_MS;
  if (stale) {
    try {
      const fresh = await withProvider("kalshi", () =>
        kalshi.fetchMarket(ticker, row ? { category: row.category, series_ticker: row.seriesTicker, title: row.event.title } : undefined),
      );
      if (!row) {
        const ev = await withProvider("kalshi", () => kalshi.fetchEvent(fresh.eventTicker));
        await upsertEvent(ev);
      }
      await upsertMarket(fresh, true);
      row = await db.market.findUnique({ where: { ticker }, include: { event: true } });
    } catch (e) {
      // A 404 for a ticker we have never seen simply means it does not exist.
      if (!(e instanceof kalshi.ProviderError && e.status === 404 && !row)) await logError("markets.detail.refresh", e, { ticker });
    }
  }
  if (!row) return null;
  const market = toNormalized(row);

  const now = Math.floor(Date.now() / 1000);
  const days = Math.max(1, historyDays);
  const period: kalshi.CandlePeriod = days <= 3 ? 60 : 1440;
  const [candles, trades, series, siblingsRows, ownSnapshots] = await Promise.all([
    withProvider("kalshi", () => kalshi.fetchCandles(market.seriesTicker, ticker, now - days * 86400, now, period)).catch(async (e) => {
      await logError("markets.candles", e, { ticker });
      return [] as Candle[];
    }),
    withProvider("kalshi", () => kalshi.fetchTrades(ticker, 40)).catch(() => [] as Trade[]),
    withProvider("kalshi", () => kalshi.fetchSeries(market.seriesTicker)).catch(() => null),
    db.market.findMany({ where: { eventTicker: market.eventTicker, NOT: { ticker } }, include: { event: true }, orderBy: { volume: "desc" }, take: 12 }),
    db.marketSnapshot.findMany({ where: { ticker }, orderBy: { ts: "asc" }, take: 500 }),
  ]);

  const model = runMarketModel(market, candles);
  if (model.estimate !== null && model.marketProb !== null) {
    const latest = await db.modelEstimate.findFirst({ where: { ticker, modelVersion: model.modelVersion }, orderBy: { createdAt: "desc" } });
    if (!latest || Date.now() - latest.createdAt.getTime() > 30 * 60_000 || Math.abs(latest.estimate - model.estimate) > 0.005) {
      await db.modelEstimate.create({
        data: { ticker, modelVersion: model.modelVersion, estimate: model.estimate, marketProb: model.marketProb, confidence: model.confidence, inputs: model.inputs as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return {
    market,
    event: row.event
      ? { title: row.event.title, subTitle: row.event.subTitle, mutuallyExclusive: row.event.mutuallyExclusive, settlementSources: (row.event.settlementSources as Array<{ name: string; url?: string }> | null) ?? [] }
      : null,
    siblings: siblingsRows.map(toNormalized),
    series,
    candles,
    candlePeriod: period === 60 ? "hourly" : "daily",
    historyDays: days,
    trades,
    model,
    movement: summarizeMovement(candles),
    ownSnapshots: ownSnapshots.map((s) => ({ ts: s.ts.toISOString(), mid: s.yesBid !== null && s.yesAsk !== null ? (s.yesBid + s.yesAsk) / 2 : s.lastPrice })),
  };
}

export async function getMarketsByTickers(tickers: string[]) {
  if (!tickers.length) return [];
  const rows = await db.market.findMany({ where: { ticker: { in: tickers } }, include: { event: true } });
  return rows.map(toNormalized);
}

/** Lightweight stats for the overview page. */
export async function getMarketOverviewStats() {
  const now = new Date();
  const [open, closing24h, cats, last] = await Promise.all([
    db.market.count({ where: { status: { in: OPEN_STATUSES } } }),
    db.market.count({ where: { status: { in: OPEN_STATUSES }, closeTime: { lte: new Date(now.getTime() + 86_400_000), gte: now } } }),
    getCategoryCounts(),
    lastSyncAt(),
  ]);
  return { open, closing24h, categories: cats, lastSyncAt: last };
}
