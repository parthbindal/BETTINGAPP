import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { SPORTS, type Sport } from "@/lib/data/sports-catalog";
import { analyzeProjection, type LogPoint } from "@/lib/analytics/projection";
import { config } from "@/lib/env";
import type { Provenance } from "@/lib/data/types";
import { insensitive } from "@/lib/data/markets";

export { SPORTS };
export type { Sport };

export function sportsProvenance(isDemo: boolean, fetchedAt: Date): Provenance {
  return isDemo
    ? { source: "demo", freshness: "demo", fetchedAt: fetchedAt.toISOString(), note: "Fictional sample data; no licensed sports feed is configured." }
    : { source: "balldontlie", freshness: "delayed", fetchedAt: fetchedAt.toISOString() };
}

export function statLabel(sport: string, stat: string): string {
  return SPORTS.find((s) => s.key === sport)?.stats.find((x) => x.key === stat)?.label ?? stat;
}

export async function getSportsOverview() {
  const [teamCounts, upcoming, playerCounts] = await Promise.all([
    db.team.groupBy({ by: ["sport", "isDemo"], _count: { _all: true } }),
    db.game.findMany({ where: { status: "scheduled", startsAt: { gte: new Date(Date.now() - 3600_000) } }, orderBy: { startsAt: "asc" }, take: 12, include: { homeTeam: true, awayTeam: true } }),
    db.player.groupBy({ by: ["sport"], _count: { _all: true } }),
  ]);
  return {
    sports: SPORTS.map((s) => ({
      ...s,
      teams: teamCounts.filter((t) => t.sport === s.key).reduce((a, t) => a + t._count._all, 0),
      players: playerCounts.find((p) => p.sport === s.key)?._count._all ?? 0,
      isDemo: teamCounts.filter((t) => t.sport === s.key).every((t) => t.isDemo),
    })),
    upcoming,
    liveProviderConfigured: config.isSportsLiveConfigured,
  };
}

export async function listTeams(sport: Sport) {
  return db.team.findMany({ where: { sport }, orderBy: { name: "asc" }, include: { _count: { select: { players: true } } } });
}

export async function listPlayers(sport: Sport, opts: { q?: string; teamId?: string; limit?: number } = {}) {
  const where: Prisma.PlayerWhereInput = {
    sport,
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
    ...(opts.q ? { name: { contains: opts.q, ...insensitive } } : {}),
  };
  return db.player.findMany({ where, include: { team: true }, orderBy: { name: "asc" }, take: opts.limit ?? 200 });
}

export async function listUpcomingGames(sport?: Sport, limit = 20) {
  return db.game.findMany({
    where: { ...(sport ? { sport } : {}), status: "scheduled", startsAt: { gte: new Date(Date.now() - 3600_000) } },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { homeTeam: true, awayTeam: true, _count: { select: { projections: true } } },
  });
}

export async function getGame(id: string) {
  const game = await db.game.findUnique({
    where: { id },
    include: {
      homeTeam: { include: { players: true } },
      awayTeam: { include: { players: true } },
      projections: { include: { player: true } },
    },
  });
  return game;
}

export interface PlayerProfile {
  player: Prisma.PlayerGetPayload<{ include: { team: true } }>;
  logs: Array<{ id: string; date: Date; isHome: boolean; minutes: number; stats: Record<string, number>; opponent: { id: string; name: string; abbreviation: string; defRating: number | null } }>;
  statKeys: string[];
  seasonAverages: Record<string, number>;
  last5Averages: Record<string, number>;
  upcoming: Prisma.GameGetPayload<{ include: { homeTeam: true; awayTeam: true } }> | null;
  projections: Array<{ id: string; stat: string; line: number; gameId: string; isDemo: boolean }>;
  provenance: Provenance;
}

export async function getPlayerProfile(playerId: string, maxLogs = 60): Promise<PlayerProfile | null> {
  const player = await db.player.findUnique({ where: { id: playerId }, include: { team: true } });
  if (!player) return null;
  const [logs, teams, upcoming, projections] = await Promise.all([
    db.playerGameLog.findMany({ where: { playerId }, orderBy: { date: "desc" }, take: maxLogs }),
    db.team.findMany({ where: { sport: player.sport }, select: { id: true, name: true, abbreviation: true, defRating: true } }),
    db.game.findFirst({
      where: { status: "scheduled", OR: [{ homeTeamId: player.teamId }, { awayTeamId: player.teamId }], startsAt: { gte: new Date(Date.now() - 3600_000) } },
      orderBy: { startsAt: "asc" },
      include: { homeTeam: true, awayTeam: true },
    }),
    db.projection.findMany({ where: { playerId, game: { status: "scheduled" } }, orderBy: { fetchedAt: "desc" } }),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const statKeys = SPORTS.find((s) => s.key === player.sport)?.stats.map((s) => s.key) ?? [];
  const normLogs = logs.map((l) => ({
    id: l.id,
    date: l.date,
    isHome: l.isHome,
    minutes: l.minutes,
    stats: l.stats as Record<string, number>,
    opponent: teamMap.get(l.opponentId) ?? { id: l.opponentId, name: "Unknown", abbreviation: "—", defRating: null },
  }));
  const avg = (ls: typeof normLogs, k: string) => (ls.length ? ls.reduce((a, l) => a + (l.stats[k] ?? 0), 0) / ls.length : NaN);
  const seasonAverages: Record<string, number> = { min: avg(normLogs, "min") };
  const last5Averages: Record<string, number> = {};
  for (const k of statKeys) {
    seasonAverages[k] = avg(normLogs, k);
    last5Averages[k] = avg(normLogs.slice(0, 5), k);
  }
  seasonAverages.minutes = normLogs.length ? normLogs.reduce((a, l) => a + l.minutes, 0) / normLogs.length : NaN;
  last5Averages.minutes = normLogs.slice(0, 5).length ? normLogs.slice(0, 5).reduce((a, l) => a + l.minutes, 0) / Math.min(5, normLogs.length) : NaN;
  return {
    player,
    logs: normLogs,
    statKeys,
    seasonAverages,
    last5Averages,
    upcoming,
    projections: projections.map((p) => ({ id: p.id, stat: p.stat, line: p.line, gameId: p.gameId, isDemo: p.isDemo })),
    provenance: sportsProvenance(player.isDemo, player.updatedAt),
  };
}

export async function analyzePlayerProjection(playerId: string, stat: string, line: number, opts: { window?: number } = {}) {
  const profile = await getPlayerProfile(playerId, opts.window ?? 60);
  if (!profile) return null;
  const points: LogPoint[] = profile.logs
    .filter((l) => typeof l.stats[stat] === "number")
    .map((l) => ({
      date: l.date.toISOString(),
      value: l.stats[stat]!,
      minutes: l.minutes,
      isHome: l.isHome,
      opponentId: l.opponent.id,
      opponentName: l.opponent.name,
      opponentDefRating: l.opponent.defRating,
    }));
  const leagueTeams = await db.team.findMany({ where: { sport: profile.player.sport }, select: { defRating: true, id: true } });
  const defs = leagueTeams.map((t) => t.defRating).filter((x): x is number => x !== null);
  const leagueDefMid = defs.length ? defs.reduce((a, b) => a + b, 0) / defs.length : null;
  const nextOpp = profile.upcoming ? (profile.upcoming.homeTeamId === profile.player.teamId ? profile.upcoming.awayTeam : profile.upcoming.homeTeam) : null;
  const analysis = analyzeProjection(points, stat, line, {
    injuryStatus: profile.player.injuryStatus,
    opponentDefRating: nextOpp?.defRating ?? null,
    leagueDefMid,
  });
  return { profile, analysis, nextOpponent: nextOpp, points };
}

/** Matchup report inputs for a game: team context plus each roster's key players. */
export async function getMatchupIntel(gameId: string) {
  const game = await getGame(gameId);
  if (!game) return null;
  const leagueTeams = await db.team.findMany({ where: { sport: game.sport } });
  const defs = leagueTeams.map((t) => t.defRating ?? 0);
  const paces = leagueTeams.map((t) => t.pace ?? 0);
  const leagueDef = defs.reduce((a, b) => a + b, 0) / Math.max(1, defs.length);
  const leaguePace = paces.reduce((a, b) => a + b, 0) / Math.max(1, paces.length);
  const rosters = await Promise.all(
    [game.homeTeam, game.awayTeam].map(async (team) => {
      const players = await db.player.findMany({ where: { teamId: team.id }, include: { gameLogs: { orderBy: { date: "desc" }, take: 15 } } });
      const rows = players
        .map((p) => {
          const mins = p.gameLogs.map((l) => l.minutes);
          const seasonMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
          const last5 = mins.slice(0, 5);
          const last5Min = last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : 0;
          return { id: p.id, name: p.name, position: p.position, injuryStatus: p.injuryStatus, injuryNote: p.injuryNote, games: p.gameLogs.length, seasonMin, last5Min, minutesDelta: seasonMin ? (last5Min - seasonMin) / seasonMin : 0 };
        })
        .sort((a, b) => b.seasonMin - a.seasonMin);
      return { team, players: rows };
    }),
  );
  return { game, leagueDef, leaguePace, rosters, provenance: sportsProvenance(game.isDemo, new Date()) };
}

/** Most recent finished games, newest first. */
export async function listRecentResults(sport?: Sport, limit = 12) {
  return db.game.findMany({
    where: { ...(sport ? { sport } : {}), status: "final", homeScore: { not: null } },
    orderBy: { startsAt: "desc" },
    take: limit,
    include: { homeTeam: true, awayTeam: true },
  });
}
