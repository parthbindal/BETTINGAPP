/**
 * Polymarket public market-data client (Gamma API — read-only, no credentials).
 * Docs: https://docs.polymarket.com. Returns a normalized CrossQuote shape.
 *
 * Prices are order-book tops (bestBid/bestAsk) from the CLOB, surfaced on the
 * Gamma market. For a binary market the two complementary outcomes' asks are
 * derived as: sideA_ask = bestAsk, sideB_ask = 1 - bestBid.
 */
import { logError } from "@/lib/ops";

const GAMMA = "https://gamma-api.polymarket.com";
const TIMEOUT_MS = 15_000;

let nextSlot = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 150;
  if (at > now) await sleep(at - now);
}

async function get<T>(path: string): Promise<T> {
  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GAMMA}${path}`, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "edgewise-research/0.1" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Polymarket ${res.status} on ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface PolyGameMeta {
  league: string; // nba | nfl | nhl | mlb ...
  away: string; // lower-case team code
  home: string;
  dateIso: string; // YYYY-MM-DD (UTC game date)
}

export interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: [string, string];
  /** Buy price (ask) for each outcome, 0..1. */
  asks: [number, number];
  /** Mid implied probability for each outcome. */
  mids: [number, number];
  spread: number | null;
  liquidity: number;
  volume24h: number;
  endDate: string | null;
  game: PolyGameMeta | null;
  fetchedAt: string;
}

interface RawMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidityNum?: number;
  volume24hr?: number;
  endDateIso?: string;
  active?: boolean;
  closed?: boolean;
  sportsMarketType?: string;
  events?: Array<{ ticker?: string; slug?: string }>;
}

function parseGame(m: RawMarket): PolyGameMeta | null {
  if (m.sportsMarketType !== "moneyline") return null;
  // events.ticker e.g. "nba-orl-bos-2026-11-16"
  const t = m.events?.[0]?.ticker ?? m.events?.[0]?.slug ?? "";
  const match = /^([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/.exec(t);
  if (!match) return null;
  return { league: match[1]!, away: match[2]!, home: match[3]!, dateIso: match[4]! };
}

function normalize(m: RawMarket): PolyMarket | null {
  let outcomes: string[];
  let prices: number[];
  try {
    outcomes = JSON.parse(m.outcomes);
    prices = JSON.parse(m.outcomePrices).map(Number);
  } catch {
    return null;
  }
  if (outcomes.length !== 2 || prices.length !== 2 || prices.some((p) => !Number.isFinite(p))) return null;
  const bestAsk = typeof m.bestAsk === "number" ? m.bestAsk : null;
  const bestBid = typeof m.bestBid === "number" ? m.bestBid : null;
  // ask for outcome 0 = bestAsk; ask for outcome 1 = 1 - bestBid (complementary token)
  const a0 = bestAsk ?? prices[0]!;
  const a1 = bestBid !== null ? 1 - bestBid : prices[1]!;
  return {
    id: m.id,
    question: m.question,
    slug: m.slug,
    outcomes: [outcomes[0]!, outcomes[1]!],
    asks: [a0, a1],
    mids: [prices[0]!, prices[1]!],
    spread: typeof m.spread === "number" ? m.spread : null,
    liquidity: m.liquidityNum ?? 0,
    volume24h: m.volume24hr ?? 0,
    endDate: m.endDateIso ?? null,
    game: parseGame(m),
    fetchedAt: new Date().toISOString(),
  };
}

/** Most active open markets (two-outcome), highest 24h volume first. */
export async function fetchActiveMarkets(limit = 400): Promise<PolyMarket[]> {
  const out: PolyMarket[] = [];
  const pageSize = 100; // Gamma caps a page at 100 regardless of the limit param
  for (let offset = 0; offset < limit; offset += pageSize) {
    const page = await get<RawMarket[]>(`/markets?closed=false&active=true&limit=${pageSize}&offset=${offset}&order=volume24hr&ascending=false`);
    if (!Array.isArray(page) || !page.length) break;
    for (const m of page) {
      const n = normalize(m);
      if (n) out.push(n);
    }
    if (page.length < pageSize) break;
  }
  return out;
}

export async function fetchActiveMarketsSafe(limit = 400): Promise<PolyMarket[]> {
  try {
    return await fetchActiveMarkets(limit);
  } catch (e) {
    await logError("polymarket.fetch", e);
    return [];
  }
}
