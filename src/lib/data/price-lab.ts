/**
 * Price Lab service: the price-first cross-venue engine.
 *
 * Pulls live Polymarket prices, matches them against the cached Kalshi
 * universe (sports game winners by league+teams+date, plus a curated set of
 * named events), and runs the comparison engine to produce ranked, explainable
 * best-odds / +EV results across two real venues.
 */
import { db } from "@/lib/db";
import { fetchActiveMarketsSafe, type PolyMarket } from "@/lib/data/providers/polymarket";
import * as kalshi from "@/lib/data/providers/kalshi";
import { refreshHotMarkets, toNormalized, OPEN_STATUSES } from "@/lib/data/markets";
import { impliedProbability, spread as bidAskSpread } from "@/lib/data/types";
import { approxKalshiFeePerContract } from "@/lib/analytics/probability";
import { parseKalshiGame, kalshiEventKey, resolveAwayHome, gameMatchKey, polyGameKey, NAMED_PAIRS, findPolyBySlug } from "@/lib/data/matching";
import { compareEvent } from "@/lib/analytics/line-comparison";
import type { EventComparison, SideComparison, VenueQuote, OppCategory } from "@/lib/data/cross-source";
import { logError, withProvider } from "@/lib/ops";
import { daysAgo } from "@/lib/time";
import { polymarketRecordUrl } from "@/lib/intel";

const KALSHI_FRESH_MS = 10 * 60_000;

function kalshiQuote(m: ReturnType<typeof toNormalized>, href: string): VenueQuote {
  const mid = impliedProbability(m);
  const ageMs = Date.now() - new Date(m.provenance.fetchedAt).getTime();
  return {
    venue: "kalshi",
    venueLabel: "Kalshi",
    ask: m.yesAsk,
    mid,
    spread: bidAskSpread(m),
    liquidity: m.openInterest,
    volume24h: m.volume24h,
    fee: m.yesAsk !== null ? approxKalshiFeePerContract(m.yesAsk) : 0,
    freshness: ageMs > KALSHI_FRESH_MS ? "delayed" : "live",
    fetchedAt: m.provenance.fetchedAt,
    href,
  };
}

function polyQuote(p: PolyMarket, sideIndex: 0 | 1): VenueQuote {
  return {
    venue: "polymarket",
    venueLabel: "Polymarket",
    ask: p.asks[sideIndex],
    mid: p.mids[sideIndex],
    spread: p.spread,
    liquidity: p.liquidity,
    volume24h: p.volume24h,
    fee: 0, // Polymarket currently charges no taker fee on these markets
    freshness: "live",
    fetchedAt: p.fetchedAt,
    // The exact international market these prices come from (polymarket.com/market/<slug> redirects to it).
    href: polymarketRecordUrl(null, p.slug) ?? "https://polymarket.com",
  };
}

type KMarket = ReturnType<typeof toNormalized>;

/** Re-quote these Kalshi markets live so the comparison is current (not cached). */
async function liveKalshi(markets: KMarket[]): Promise<Map<string, KMarket>> {
  const meta = new Map(markets.map((m) => [m.ticker, { category: m.category, series_ticker: m.seriesTicker, title: m.title }]));
  if (!meta.size) return new Map();
  try {
    const fresh = await withProvider("kalshi", () => kalshi.fetchMarketsByTickers([...meta.keys()], meta));
    return new Map(fresh.map((m): [string, KMarket] => [m.ticker, m]));
  } catch (e) {
    await logError("pricelab.liveKalshi", e);
    return new Map();
  }
}

async function buildSportsComparisons(polys: PolyMarket[]): Promise<EventComparison[]> {
  const polyByKey = new Map<string, PolyMarket>();
  for (const p of polys) {
    const k = polyGameKey(p);
    if (k) polyByKey.set(k, p);
  }
  if (!polyByKey.size) return [];

  const rows = await db.market.findMany({
    where: { category: "Sports", status: { in: OPEN_STATUSES }, title: { contains: " wins" }, yesAsk: { not: null }, closeTime: { gte: daysAgo(0.1) } },
    include: { event: true },
    take: 3000,
  });

  // Group Kalshi markets by event (league|blob|date), collecting each team's market.
  const events = new Map<string, { parts: ReturnType<typeof parseKalshiGame>; markets: Array<{ team: string; m: KMarket }> }>();
  for (const row of rows) {
    const parsed = parseKalshiGame(row.ticker);
    if (!parsed) continue;
    const key = kalshiEventKey(parsed);
    const e = events.get(key) ?? { parts: parsed, markets: [] };
    e.markets.push({ team: parsed.teamCode, m: toNormalized(row) });
    events.set(key, e);
  }

  // First pass: find matched games (poly match + both Kalshi sides present).
  type Matched = { matchKey: string; awayM: KMarket; homeM: KMarket; poly: PolyMarket; parts: NonNullable<ReturnType<typeof parseKalshiGame>> };
  const matched: Matched[] = [];
  for (const [, e] of events) {
    if (!e.parts || e.markets.length !== 2) continue;
    const [c1, c2] = [e.markets[0]!, e.markets[1]!];
    const ah = resolveAwayHome(e.parts.blob, c1.team, c2.team);
    if (!ah) continue;
    const awayM = c1.team === ah.away ? c1.m : c2.m;
    const homeM = c1.team === ah.home ? c1.m : c2.m;
    const matchKey = gameMatchKey(e.parts.league, ah.away, ah.home, e.parts.dateIso);
    const poly = polyByKey.get(matchKey);
    if (!poly) continue;
    matched.push({ matchKey, awayM, homeM, poly, parts: e.parts });
  }
  // Live re-quote only the matched Kalshi markets so both sides are current.
  const fresh = await liveKalshi(matched.flatMap((m) => [m.awayM, m.homeM]));

  const out: EventComparison[] = [];
  for (const mt of matched) {
    const awayM = fresh.get(mt.awayM.ticker) ?? mt.awayM;
    const homeM = fresh.get(mt.homeM.ticker) ?? mt.homeM;
    const matchKey = mt.matchKey;
    const poly = mt.poly;
    const e = { parts: mt.parts };
    const kHref = (m: KMarket) => `/markets/${m.ticker}`;
    const sides: SideComparison[] = [
      { label: awayM.yesSubTitle ?? awayM.title, venues: [kalshiQuote(awayM, kHref(awayM)), polyQuote(poly, 0)] },
      { label: homeM.yesSubTitle ?? homeM.title, venues: [kalshiQuote(homeM, kHref(homeM)), polyQuote(poly, 1)] },
    ];
    out.push(
      compareEvent({
        key: `game:${matchKey}`,
        title: `${awayM.title.replace(/ wins$/, "")} @ ${homeM.title.replace(/ wins$/, "")}`,
        category: "Sports",
        subtitle: `${e.parts.league.toUpperCase()} moneyline`,
        kind: "sports_game",
        startsAt: awayM.closeTime,
        matchConfidence: "high",
        matchReason: `Matched on ${mt.parts.league.toUpperCase()} (${mt.parts.dateIso}) via team codes + date. Both venues settle on the game winner, so the markets are equivalent. Kalshi re-quoted live.`,
        sides,
      }),
    );
  }
  return out;
}

async function buildNamedComparisons(polys: PolyMarket[]): Promise<EventComparison[]> {
  const out: EventComparison[] = [];
  for (const pair of NAMED_PAIRS) {
    const row = await db.market.findUnique({ where: { ticker: pair.kalshiTicker }, include: { event: true } });
    const poly = findPolyBySlug(polys, pair.polySlugIncludes);
    if (!row || !poly) continue;
    const cached = toNormalized(row);
    const fresh = await liveKalshi([cached]);
    const k = fresh.get(cached.ticker) ?? cached;
    const kMid = impliedProbability(k);
    // Kalshi YES side and NO side.
    const kalshiYes = kalshiQuote(k, `/markets/${k.ticker}`);
    const kalshiNo: VenueQuote = { ...kalshiYes, ask: k.yesBid !== null ? 1 - k.yesBid : null, mid: kMid !== null ? 1 - kMid : null, fee: k.yesBid !== null ? approxKalshiFeePerContract(1 - k.yesBid) : 0 };
    // Polymarket outcome mapping (invert if its outcome[0] is the NO of the Kalshi YES).
    const yesIdx: 0 | 1 = pair.invert ? 1 : 0;
    const noIdx: 0 | 1 = pair.invert ? 0 : 1;
    const sides: SideComparison[] = [
      { label: `YES — ${pair.label}`, venues: [kalshiYes, polyQuote(poly, yesIdx)] },
      { label: "NO", venues: [kalshiNo, polyQuote(poly, noIdx)] },
    ];
    out.push(
      compareEvent({
        key: `named:${pair.kalshiTicker}`,
        title: pair.label,
        category: row.category,
        subtitle: "Named event",
        kind: "named_event",
        startsAt: k.closeTime,
        matchConfidence: "high",
        matchReason: `Curated equivalence: Kalshi ${pair.kalshiTicker} and Polymarket "${poly.question}" resolve on the same outcome.`,
        sides,
      }),
    );
  }
  return out;
}

const ORDER: Record<OppCategory, number> = { strong: 0, moderate: 1, low: 2, none: 3, insufficient: 4 };

export interface PriceLabResult {
  comparisons: EventComparison[];
  polymarketUp: boolean;
  polyCount: number;
  generatedAt: string;
  sportsbookConfigured: boolean;
}

export async function runPriceLab(opts: { kind?: "all" | "sports_game" | "named_event"; refresh?: boolean } = {}): Promise<PriceLabResult> {
  // Optional targeted re-quote of Kalshi; by default we rely on the hot-refresh
  // job / background refresh and label each quote's freshness honestly.
  if (opts.refresh) await refreshHotMarkets().catch(() => {});
  const polys = await fetchActiveMarketsSafe(400);
  let comparisons: EventComparison[] = [];
  if (polys.length) {
    try {
      const [games, named] = await Promise.all([buildSportsComparisons(polys), buildNamedComparisons(polys)]);
      comparisons = [...games, ...named];
    } catch (e) {
      await logError("pricelab.build", e);
    }
  }
  if (opts.kind && opts.kind !== "all") comparisons = comparisons.filter((c) => c.kind === opts.kind);
  comparisons.sort((a, b) => ORDER[a.opportunity] - ORDER[b.opportunity] || b.discrepancyScore - a.discrepancyScore);
  return {
    comparisons,
    polymarketUp: polys.length > 0,
    polyCount: polys.length,
    generatedAt: new Date().toISOString(),
    sportsbookConfigured: false, // reserved: needs a licensed odds API key (The Odds API / OpticOdds)
  };
}
