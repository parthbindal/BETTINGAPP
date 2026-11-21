/**
 * Analyst tools: thin, typed wrappers over the data services. Each result
 * includes provenance so the model can cite source and freshness. Tools are
 * also used by the rule-based fallback mode.
 */
import { z } from "zod";
import { listMarkets, getMarketDetail, getMarketMovers } from "@/lib/data/markets";
import { listPlayers, getPlayerProfile, analyzePlayerProjection, getMatchupIntel, listUpcomingGames, SPORTS, statLabel } from "@/lib/data/sports";
import { impliedProbability, spread } from "@/lib/data/types";
import { contractExpectedValue, approxKalshiFeePerContract, americanToProb, decimalToProb, probToAmerican, probToDecimal } from "@/lib/analytics/probability";
import { COURSES } from "@/content/academy";
import { db } from "@/lib/db";
import type { PlanLimits } from "@/lib/subscriptions/plans";

export interface ToolContext {
  userId: string;
  limits: PlanLimits;
}

export const toolSchemas = {
  search_markets: z.object({
    query: z.string().describe("Free-text search over market titles and tickers").default(""),
    category: z.string().describe("Optional Kalshi category, e.g. Economics, Elections, Sports, Climate and Weather").optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  get_market: z.object({
    ticker: z.string().describe("Kalshi market ticker, e.g. KXNEXTSPEAKER-31-HJEF"),
  }),
  get_market_history: z.object({
    ticker: z.string(),
    days: z.number().int().min(1).max(730).default(30).describe("Days of history; capped by the user's plan"),
  }),
  get_market_movers: z.object({ limit: z.number().int().min(1).max(15).default(8) }),
  search_players: z.object({
    query: z.string().default(""),
    sport: z.enum(["basketball", "football", "soccer", "hockey"]).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  get_player: z.object({ playerId: z.string() }),
  analyze_projection: z.object({
    playerId: z.string(),
    stat: z.string().describe("Stat key such as pts, reb, ast, threes, passYds, recYds, sot, goals, shots"),
    line: z.number().describe("The projection line, e.g. 24.5"),
  }),
  get_matchup: z.object({ gameId: z.string() }),
  list_upcoming_games: z.object({ sport: z.enum(["basketball", "football", "soccer", "hockey"]).optional(), limit: z.number().int().min(1).max(20).default(10) }),
  get_watchlist: z.object({}),
  get_lesson: z.object({ topic: z.string().describe("Concept to look up in the Academy, e.g. 'expected value', 'brier score', 'implied probability'") }),
  compute_contract_ev: z.object({
    probability: z.number().min(0).max(1).describe("Your probability estimate for YES"),
    price: z.number().min(0).max(1).describe("Contract price in dollars (0.62 = 62¢)"),
    includeKalshiFee: z.boolean().default(true),
  }),
  convert_odds: z.object({
    format: z.enum(["american", "decimal", "probability"]),
    value: z.number(),
  }),
};

export type ToolName = keyof typeof toolSchemas;

export const toolDescriptions: Record<ToolName, string> = {
  search_markets: "Search open Kalshi prediction markets (cached public data) by text and category. Returns ticker, title, implied probability, volume, close time and provenance.",
  get_market: "Get full detail for one market: quote, spread, liquidity, resolution rules, settlement sources, recent movement, and the EDGEWISE heuristic model estimate with confidence and inputs.",
  get_market_history: "Get the implied-probability time series (daily or hourly candles) for a market, with a movement summary. Depth is capped by the user's plan.",
  get_market_movers: "Markets with the largest recent price changes among liquid markets.",
  search_players: "Search players in the sports database. NOTE: when no licensed provider is configured, all sports data is fictional DEMO data and must be described as such.",
  get_player: "Player profile: season and last-5 averages, minutes, injury status, upcoming game, available projection lines, game-log count, provenance.",
  analyze_projection: "Compare a stat line to the player's game logs: averages, median, distribution, hit rates by window, home/away and defense splits, minutes trend, blended probability with interval and confidence, and flags.",
  get_matchup: "Matchup intelligence for a game: team pace and defensive ratings vs league, roster minutes trends, injuries.",
  list_upcoming_games: "Upcoming scheduled games with projection counts.",
  get_watchlist: "The user's saved watchlist items.",
  get_lesson: "Retrieve a Learning Academy lesson to teach a concept accurately.",
  compute_contract_ev: "Deterministic expected value for a $1 binary contract at a price, given a probability estimate, optionally net of the approximate Kalshi taker fee.",
  convert_odds: "Convert between American odds, decimal odds, and implied probability.",
};

type Infer<T extends ToolName> = z.infer<(typeof toolSchemas)[T]>;

export async function runTool(name: ToolName, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "search_markets": {
      const input = toolSchemas.search_markets.parse(rawInput) as Infer<"search_markets">;
      const { items } = await listMarkets({ q: input.query || undefined, category: input.category, limit: input.limit, sort: "volume24h" });
      return {
        count: items.length,
        markets: items.map((m) => ({
          ticker: m.ticker,
          title: m.title,
          yesSubTitle: m.yesSubTitle,
          category: m.category,
          impliedProbability: impliedProbability(m),
          yesBid: m.yesBid,
          yesAsk: m.yesAsk,
          spread: spread(m),
          volume24h: m.volume24h,
          openInterest: m.openInterest,
          closeTime: m.closeTime,
          provenance: m.provenance,
        })),
      };
    }
    case "get_market": {
      const input = toolSchemas.get_market.parse(rawInput) as Infer<"get_market">;
      const d = await getMarketDetail(input.ticker.toUpperCase(), Math.min(30, ctx.limits.marketHistoryDays));
      if (!d) return { error: "Market not found in Kalshi public data." };
      return {
        market: {
          ...d.market,
          impliedProbability: impliedProbability(d.market),
          spread: spread(d.market),
          approxTakerFeePerContract: impliedProbability(d.market) !== null ? approxKalshiFeePerContract(impliedProbability(d.market)!) : null,
        },
        event: d.event,
        series: d.series ? { title: d.series.title, feeType: d.series.feeType, contractUrl: d.series.contractUrl, settlementSources: d.series.settlementSources } : null,
        siblings: d.siblings.slice(0, 8).map((s) => ({ ticker: s.ticker, yesSubTitle: s.yesSubTitle, title: s.title, impliedProbability: impliedProbability(s), volume24h: s.volume24h })),
        movement: d.movement,
        candleCount: d.candles.length,
        historyDays: d.historyDays,
        recentTrades: d.trades.slice(0, 10),
        model: { ...d.model, note: "Heuristic EDGEWISE estimate (calib-v0.1). Not an independent forecast of the real-world event." },
      };
    }
    case "get_market_history": {
      const input = toolSchemas.get_market_history.parse(rawInput) as Infer<"get_market_history">;
      const days = Math.min(input.days, ctx.limits.marketHistoryDays);
      const d = await getMarketDetail(input.ticker.toUpperCase(), days);
      if (!d) return { error: "Market not found." };
      return {
        ticker: d.market.ticker,
        title: d.market.title,
        requestedDays: input.days,
        allowedDays: days,
        planCapped: input.days > days,
        period: d.candlePeriod,
        points: d.candles.map((c) => ({ ts: new Date(c.ts * 1000).toISOString(), close: c.close, volume: c.volume })),
        movement: d.movement,
        provenance: d.market.provenance,
      };
    }
    case "get_market_movers": {
      const input = toolSchemas.get_market_movers.parse(rawInput) as Infer<"get_market_movers">;
      const movers = await getMarketMovers(input.limit);
      return movers.map((x) => ({ ticker: x.market.ticker, title: x.market.title, yesSubTitle: x.market.yesSubTitle, lastPrice: x.market.lastPrice, previousPrice: x.market.previousPrice, deltaPts: x.delta, volume24h: x.market.volume24h, provenance: x.market.provenance }));
    }
    case "search_players": {
      const input = toolSchemas.search_players.parse(rawInput) as Infer<"search_players">;
      const sports = input.sport ? [input.sport] : SPORTS.map((s) => s.key);
      const out: unknown[] = [];
      for (const s of sports) {
        const players = await listPlayers(s, { q: input.query || undefined, limit: input.limit });
        for (const p of players) out.push({ playerId: p.id, name: p.name, sport: p.sport, team: p.team.name, position: p.position, injuryStatus: p.injuryStatus, isDemo: p.isDemo });
        if (out.length >= input.limit) break;
      }
      return { count: out.length, players: out.slice(0, input.limit), note: out.some((p) => (p as { isDemo: boolean }).isDemo) ? "DEMO: these players, teams and statistics are fictional sample data." : undefined };
    }
    case "get_player": {
      const input = toolSchemas.get_player.parse(rawInput) as Infer<"get_player">;
      const p = await getPlayerProfile(input.playerId, 40);
      if (!p) return { error: "Player not found." };
      return {
        player: { id: p.player.id, name: p.player.name, team: p.player.team.name, position: p.player.position, sport: p.player.sport, injuryStatus: p.player.injuryStatus, injuryNote: p.player.injuryNote, isDemo: p.player.isDemo },
        gamesLogged: p.logs.length,
        seasonAverages: p.seasonAverages,
        last5Averages: p.last5Averages,
        statLabels: Object.fromEntries(p.statKeys.map((k) => [k, statLabel(p.player.sport, k)])),
        upcomingGame: p.upcoming ? { gameId: p.upcoming.id, startsAt: p.upcoming.startsAt, home: p.upcoming.homeTeam.name, away: p.upcoming.awayTeam.name } : null,
        projections: p.projections,
        provenance: p.provenance,
      };
    }
    case "analyze_projection": {
      const input = toolSchemas.analyze_projection.parse(rawInput) as Infer<"analyze_projection">;
      const r = await analyzePlayerProjection(input.playerId, input.stat, input.line);
      if (!r) return { error: "Player not found." };
      return { player: { id: r.profile.player.id, name: r.profile.player.name, isDemo: r.profile.player.isDemo }, statLabel: statLabel(r.profile.player.sport, input.stat), nextOpponent: r.nextOpponent ? { name: r.nextOpponent.name, defRating: r.nextOpponent.defRating, pace: r.nextOpponent.pace } : null, analysis: r.analysis, provenance: r.profile.provenance };
    }
    case "get_matchup": {
      const input = toolSchemas.get_matchup.parse(rawInput) as Infer<"get_matchup">;
      const m = await getMatchupIntel(input.gameId);
      if (!m) return { error: "Game not found." };
      return {
        game: { id: m.game.id, sport: m.game.sport, startsAt: m.game.startsAt, home: m.game.homeTeam.name, away: m.game.awayTeam.name, venue: m.game.venue, isDemo: m.game.isDemo },
        league: { avgDefRating: m.leagueDef, avgPace: m.leaguePace },
        teams: m.rosters.map((r) => ({ team: r.team.name, pace: r.team.pace, defRating: r.team.defRating, offRating: r.team.offRating, players: r.players.slice(0, 8) })),
        provenance: m.provenance,
      };
    }
    case "list_upcoming_games": {
      const input = toolSchemas.list_upcoming_games.parse(rawInput) as Infer<"list_upcoming_games">;
      const games = await listUpcomingGames(input.sport, input.limit);
      return games.map((g) => ({ gameId: g.id, sport: g.sport, startsAt: g.startsAt, home: g.homeTeam.name, away: g.awayTeam.name, projections: g._count.projections, isDemo: g.isDemo }));
    }
    case "get_watchlist": {
      const items = await db.watchlistItem.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50 });
      return items.map((i) => ({ kind: i.kind, refId: i.refId, label: i.label, addedAt: i.createdAt }));
    }
    case "get_lesson": {
      const input = toolSchemas.get_lesson.parse(rawInput) as Infer<"get_lesson">;
      const q = input.topic.toLowerCase();
      const hits = COURSES.flatMap((c) => c.lessons.map((l) => ({ course: c, lesson: l }))).filter(({ lesson }) => lesson.title.toLowerCase().includes(q) || lesson.summary.toLowerCase().includes(q) || lesson.slug.includes(q.replace(/\s+/g, "-")));
      if (!hits.length) return { found: false, note: "No lesson matched; explain from first principles and say the Academy does not yet cover this topic." };
      const { course, lesson } = hits[0]!;
      return { found: true, href: `/academy/${course.slug}/${lesson.slug}`, title: lesson.title, level: course.level, body: lesson.body };
    }
    case "compute_contract_ev": {
      const input = toolSchemas.compute_contract_ev.parse(rawInput) as Infer<"compute_contract_ev">;
      const fee = input.includeKalshiFee ? approxKalshiFeePerContract(input.price) : 0;
      const r = contractExpectedValue(input.probability, input.price, fee);
      return { ...r, feePerContract: fee, note: "EV = p × $1 − price − fee. Fee is an approximation of Kalshi's standard taker fee; check the series fee schedule." };
    }
    case "convert_odds": {
      const input = toolSchemas.convert_odds.parse(rawInput) as Infer<"convert_odds">;
      let p: number;
      if (input.format === "american") p = americanToProb(input.value);
      else if (input.format === "decimal") p = decimalToProb(input.value);
      else p = input.value;
      return { impliedProbability: p, american: probToAmerican(p), decimal: probToDecimal(p), note: "Implied probability includes any bookmaker margin; remove the vig across all outcomes for a fair probability." };
    }
  }
}

export function toolList(): ToolName[] {
  return Object.keys(toolSchemas) as ToolName[];
}
