/**
 * Kalshi public market-data client (official REST API, read-only endpoints
 * that need no credentials). Docs: https://docs.kalshi.com
 *
 * Every function returns normalized types with provenance. Errors throw
 * `ProviderError` so the service layer can record provider health.
 *
 * The client is deliberately polite: requests from this process are spaced
 * out, and HTTP 429 responses back the whole client off before retrying.
 */
import { config } from "@/lib/env";
import type { Candle, NormalizedEvent, NormalizedMarket, SeriesInfo, Trade } from "@/lib/data/types";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const BASE = config.kalshiApiBase;
const TIMEOUT_MS = 20_000;
const MIN_INTERVAL_MS = 200; // about five requests per second for the whole process
const MAX_RETRIES = 3;

let nextSlot = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reserve the next request slot so concurrent callers are spaced, not bursty. */
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "edgewise-research/0.1" },
        cache: "no-store", // market data changes constantly
      });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
        nextSlot = Math.max(nextSlot, Date.now() + wait); // back off every caller, not just this one
        continue;
      }
      if (!res.ok) throw new ProviderError("kalshi", `Kalshi ${res.status} on ${path}`, res.status);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("kalshi", e instanceof Error ? e.message : "Kalshi request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---- raw shapes (subset) ----
interface RawMarket {
  ticker: string;
  event_ticker: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  status: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
  rules_primary?: string;
  rules_secondary?: string;
  result?: string;
  market_type?: string;
}
interface RawEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title?: string;
  category: string;
  mutually_exclusive?: boolean;
  settlement_sources?: Array<{ name: string; url?: string }>;
  markets?: RawMarket[];
}

/** Event-level fields a market needs for normalization (the /markets endpoints omit them). */
export interface EventMeta {
  category: string;
  series_ticker: string;
  title?: string;
}

/** Multivariate "combo" collections are parlays, not single-question markets. */
const isCombo = (ticker: string) => ticker.startsWith("KXMVE");

function normalizeMarket(m: RawMarket, ev: EventMeta, fetchedAt: string): NormalizedMarket {
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    seriesTicker: ev.series_ticker,
    title: m.title || ev.title || m.ticker,
    subtitle: m.subtitle || null,
    yesSubTitle: m.yes_sub_title || null,
    category: ev.category || "Other",
    status: m.status,
    yesBid: toNum(m.yes_bid_dollars),
    yesAsk: toNum(m.yes_ask_dollars),
    lastPrice: toNum(m.last_price_dollars),
    previousPrice: toNum(m.previous_price_dollars),
    volume: toNum(m.volume_fp) ?? 0,
    volume24h: toNum(m.volume_24h_fp) ?? 0,
    openInterest: toNum(m.open_interest_fp) ?? 0,
    openTime: m.open_time ?? null,
    closeTime: m.close_time ?? null,
    expirationTime: m.expiration_time ?? null,
    rulesPrimary: m.rules_primary ?? null,
    rulesSecondary: m.rules_secondary ?? null,
    result: m.result || null,
    provenance: { source: "kalshi", freshness: "live", fetchedAt },
  };
}

function normalizeEvent(e: RawEvent, fetchedAt: string): NormalizedEvent {
  const markets = (e.markets ?? []).filter((m) => !isCombo(m.ticker)).map((m) => normalizeMarket(m, e, fetchedAt));
  return {
    eventTicker: e.event_ticker,
    seriesTicker: e.series_ticker,
    title: e.title,
    subTitle: e.sub_title || null,
    category: e.category || "Other",
    mutuallyExclusive: Boolean(e.mutually_exclusive),
    settlementSources: e.settlement_sources ?? [],
    markets,
    provenance: { source: "kalshi", freshness: "live", fetchedAt },
  };
}

/** One page (up to 200 events) of the open-events feed, with nested markets. */
export async function fetchOpenEvents(opts: { limit?: number; cursor?: string; seriesTicker?: string } = {}) {
  const fetchedAt = new Date().toISOString();
  const data = await get<{ events: RawEvent[]; cursor?: string }>("/events", {
    status: "open",
    with_nested_markets: "true",
    limit: opts.limit ?? 200,
    cursor: opts.cursor,
    series_ticker: opts.seriesTicker,
  });
  return {
    events: (data.events ?? []).filter((e) => !isCombo(e.event_ticker)).map((e) => normalizeEvent(e, fetchedAt)),
    cursor: data.cursor || null,
  };
}

export async function fetchEvent(eventTicker: string): Promise<NormalizedEvent> {
  const fetchedAt = new Date().toISOString();
  const data = await get<{ event: RawEvent; markets?: RawMarket[] }>(`/events/${encodeURIComponent(eventTicker)}`, {
    with_nested_markets: "true",
  });
  const ev = data.event;
  if (!ev.markets && data.markets) ev.markets = data.markets;
  return normalizeEvent(ev, fetchedAt);
}

export async function fetchMarket(ticker: string, eventMeta?: EventMeta): Promise<NormalizedMarket> {
  const fetchedAt = new Date().toISOString();
  const data = await get<{ market: RawMarket }>(`/markets/${encodeURIComponent(ticker)}`);
  const meta = eventMeta ?? (await fetchEventMeta(data.market.event_ticker));
  return normalizeMarket(data.market, meta, fetchedAt);
}

async function fetchEventMeta(eventTicker: string): Promise<EventMeta> {
  const data = await get<{ event: RawEvent }>(`/events/${encodeURIComponent(eventTicker)}`);
  return { category: data.event.category, series_ticker: data.event.series_ticker, title: data.event.title };
}

/**
 * Batch quote refresh: up to ~100 tickers per request. Markets whose event
 * metadata is unknown to the caller are skipped (fetch their event instead).
 */
export async function fetchMarketsByTickers(tickers: string[], meta: Map<string, EventMeta>): Promise<NormalizedMarket[]> {
  if (!tickers.length) return [];
  const fetchedAt = new Date().toISOString();
  const data = await get<{ markets: RawMarket[] }>("/markets", { tickers: tickers.join(","), limit: 1000 });
  const out: NormalizedMarket[] = [];
  for (const m of data.markets ?? []) {
    const em = meta.get(m.ticker);
    if (em) out.push(normalizeMarket(m, em, fetchedAt));
  }
  return out;
}

/** Which events do these tickers belong to, ranked by 24h volume. Used to bootstrap an empty cache. */
export async function fetchEventTickersFor(tickers: string[]): Promise<Array<{ eventTicker: string; volume24h: number }>> {
  if (!tickers.length) return [];
  const data = await get<{ markets: RawMarket[] }>("/markets", { tickers: tickers.join(","), limit: 1000 });
  const byEvent = new Map<string, number>();
  for (const m of data.markets ?? []) byEvent.set(m.event_ticker, (byEvent.get(m.event_ticker) ?? 0) + (toNum(m.volume_24h_fp) ?? 0));
  return [...byEvent.entries()].map(([eventTicker, volume24h]) => ({ eventTicker, volume24h })).sort((a, b) => b.volume24h - a.volume24h);
}

/** Tickers that traded most recently across the whole exchange (most trades first). */
export async function fetchRecentlyTradedTickers(limit = 1000): Promise<Array<{ ticker: string; trades: number }>> {
  const data = await get<{ trades: Array<{ ticker: string }> }>("/markets/trades", { limit });
  const counts = new Map<string, number>();
  for (const t of data.trades ?? []) if (!isCombo(t.ticker)) counts.set(t.ticker, (counts.get(t.ticker) ?? 0) + 1);
  return [...counts.entries()].map(([ticker, trades]) => ({ ticker, trades })).sort((a, b) => b.trades - a.trades);
}

export async function fetchSeries(seriesTicker: string): Promise<SeriesInfo> {
  const data = await get<{
    series: {
      ticker: string;
      title: string;
      category: string;
      frequency?: string;
      fee_type?: string;
      contract_url?: string;
      settlement_sources?: Array<{ name: string; url?: string }>;
    };
  }>(`/series/${encodeURIComponent(seriesTicker)}`);
  const s = data.series;
  return {
    ticker: s.ticker,
    title: s.title,
    category: s.category,
    frequency: s.frequency ?? null,
    feeType: s.fee_type ?? null,
    contractUrl: s.contract_url ?? null,
    settlementSources: s.settlement_sources ?? [],
  };
}

export type CandlePeriod = 1 | 60 | 1440;

export async function fetchCandles(seriesTicker: string, ticker: string, startTs: number, endTs: number, period: CandlePeriod): Promise<Candle[]> {
  const data = await get<{
    candlesticks: Array<{
      end_period_ts: number;
      price: { open_dollars?: string; high_dollars?: string; low_dollars?: string; close_dollars?: string; mean_dollars?: string };
      yes_bid?: { close_dollars?: string };
      yes_ask?: { close_dollars?: string };
      volume_fp?: string;
      open_interest_fp?: string;
    }>;
  }>(`/series/${encodeURIComponent(seriesTicker)}/markets/${encodeURIComponent(ticker)}/candlesticks`, {
    start_ts: Math.floor(startTs),
    end_ts: Math.floor(endTs),
    period_interval: period,
  });
  return (data.candlesticks ?? []).map((c) => ({
    ts: c.end_period_ts,
    open: toNum(c.price?.open_dollars),
    high: toNum(c.price?.high_dollars),
    low: toNum(c.price?.low_dollars),
    close: toNum(c.price?.close_dollars),
    mean: toNum(c.price?.mean_dollars),
    yesBidClose: toNum(c.yes_bid?.close_dollars),
    yesAskClose: toNum(c.yes_ask?.close_dollars),
    volume: toNum(c.volume_fp) ?? 0,
    openInterest: toNum(c.open_interest_fp) ?? 0,
  }));
}

export async function fetchTrades(ticker: string, limit = 50): Promise<Trade[]> {
  const data = await get<{
    trades: Array<{ trade_id: string; created_time: string; yes_price_dollars: string; count_fp: string; taker_side: string }>;
  }>("/markets/trades", { ticker, limit });
  return (data.trades ?? []).map((t) => ({
    id: t.trade_id,
    ts: t.created_time,
    yesPrice: toNum(t.yes_price_dollars) ?? 0,
    count: toNum(t.count_fp) ?? 0,
    takerSide: t.taker_side === "no" ? "no" : "yes",
  }));
}
