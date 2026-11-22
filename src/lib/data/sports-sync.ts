/**
 * Live NBA sync from balldontlie into our sports tables. Basketball becomes real
 * data; the other demo sports (football/soccer/hockey) are left untouched because
 * balldontlie's free/standard NBA plan does not cover them.
 *
 * Tier behaviour (see providers/balldontlie.ts): teams, players and games work on
 * the Free tier. Box scores (/stats) need ALL-STAR+, so real game logs and the
 * projections built from them only appear on that tier; on Free they are skipped
 * and the page shows real rosters and schedule with no prop lines.
 */
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { logError } from "@/lib/ops";
import {
  fetchTeams,
  fetchActivePlayers,
  fetchGames,
  fetchStatsForGames,
  parseMinutes,
  mapGameStatus,
  toLine,
  statLineFromBox,
  BalldontlieAuthError,
  type BdlStat,
  type BdlPlayer,
} from "@/lib/data/providers/balldontlie";

const SPORT = "basketball";
const SOURCE = "balldontlie";
const PROJECTABLE = ["pts", "reb", "ast", "threes", "pra"] as const;

const teamId = (id: number) => `nba-t${id}`;
const playerId = (id: number) => `nba-p${id}`;
const gameId = (id: number) => `nba-g${id}`;

export interface SportsSyncResult {
  configured: boolean;
  teams: number;
  players: number;
  games: number;
  logs: number;
  projections: number;
  /** Whether rosters + box-score projections were reachable (ALL-STAR+) or gated to a paid tier (Free). */
  tier: "full" | "teams_and_schedule";
  statsTier: "available" | "gated" | "skipped";
  note: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}




export async function syncNbaFromBalldontlie(opts: { logWindowDays?: number; upcomingDays?: number; maxLogGames?: number } = {}): Promise<SportsSyncResult> {
  const empty = (note: string, statsTier: SportsSyncResult["statsTier"]): SportsSyncResult => ({ configured: Boolean(config.balldontlieApiKey), teams: 0, players: 0, games: 0, logs: 0, projections: 0, tier: "teams_and_schedule", statsTier, note });
  if (!config.balldontlieApiKey) return empty("BALLDONTLIE_API_KEY is not set; nothing synced (demo data left in place).", "skipped");

  const logWindowDays = opts.logWindowDays ?? 21;
  const upcomingDays = opts.upcomingDays ?? 10;
  const maxLogGames = opts.maxLogGames ?? 80;
  const now = new Date();
  const start = new Date(now.getTime() - logWindowDays * 86400_000);
  const end = new Date(now.getTime() + upcomingDays * 86400_000);

  // 1) Teams — keep the 30 franchises (they carry a conference + division).
  const rawTeams = await fetchTeams();
  const teams = rawTeams.filter((t) => t.division && (t.conference === "East" || t.conference === "West"));
  if (teams.length === 0) return empty("balldontlie returned no NBA teams; demo data left in place.", "skipped");
  const bdlTeamIds = teams.map((t) => t.id);

  // 3) Games across the window (recent + upcoming) — real on every tier.
  const rawGames = await fetchGames(ymd(start), ymd(end));
  const games = rawGames.filter((g) => g.home_team && g.visitor_team);

  // 2) Active rosters — ALL-STAR+ only. On Free this 401s, so we sync real teams and
  // the real schedule but no rosters (the plain /players endpoint returns a historical
  // dump, not current rosters, so we deliberately do not fall back to it).
  let players: BdlPlayer[] = [];
  let tier: SportsSyncResult["tier"] = "full";
  try {
    const rawPlayers = await fetchActivePlayers(bdlTeamIds);
    players = rawPlayers.filter((p) => p.team && bdlTeamIds.includes(p.team.id));
  } catch (e) {
    if (e instanceof BalldontlieAuthError) {
      tier = "teams_and_schedule";
      await logError("sports.sync.rostersGated", e);
    } else {
      throw e;
    }
  }

  // 4) Box scores for recent final games -> logs. Same ALL-STAR+ gate as rosters, so
  // we only attempt it when rosters were reachable.
  const finalGames = games
    .filter((g) => mapGameStatus(g.status_state) === "final")
    .sort((a, b) => +new Date(b.datetime ?? b.date) - +new Date(a.datetime ?? a.date))
    .slice(0, maxLogGames);
  let stats: BdlStat[] = [];
  let statsTier: SportsSyncResult["statsTier"] = tier === "full" ? "available" : "gated";
  if (tier === "full" && finalGames.length) {
    try {
      stats = await fetchStatsForGames(finalGames.map((g) => g.id));
    } catch (e) {
      if (e instanceof BalldontlieAuthError) {
        statsTier = "gated";
        await logError("sports.sync.statsGated", e);
      } else {
        throw e;
      }
    }
  } else if (tier === "full") {
    statsTier = "skipped";
  }

  const knownPlayerIds = new Set(players.map((p) => p.id));
  const logs = stats
    .filter((s) => s.min && parseMinutes(s.min) > 0 && knownPlayerIds.has(s.player.id))
    .map((s) => {
      const isHome = s.team.id === s.game.home_team_id;
      const opponentBdlId = isHome ? s.game.visitor_team_id : s.game.home_team_id;
      return {
        playerId: playerId(s.player.id),
        gameId: gameId(s.game.id),
        date: new Date(s.game.date),
        isHome,
        opponentId: teamId(opponentBdlId),
        minutes: parseMinutes(s.min),
        stats: statLineFromBox(s),
      };
    });

  // 5) Projections from real logs for the top players (by minutes) in upcoming games.
  const upcoming = games.filter((g) => mapGameStatus(g.status_state) !== "final" && +new Date(g.datetime ?? g.date) >= now.getTime());
  const logsByPlayer = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = logsByPlayer.get(l.playerId) ?? [];
    arr.push(l);
    logsByPlayer.set(l.playerId, arr);
  }
  const avgMinutes = (pid: string) => {
    const ls = logsByPlayer.get(pid) ?? [];
    return ls.length ? ls.reduce((a, l) => a + l.minutes, 0) / ls.length : 0;
  };
  const playersByTeam = new Map<string, string[]>();
  for (const p of players) {
    const tid = teamId(p.team!.id);
    const arr = playersByTeam.get(tid) ?? [];
    arr.push(playerId(p.id));
    playersByTeam.set(tid, arr);
  }
  const projections: Array<{ playerId: string; gameId: string; stat: string; line: number }> = [];
  for (const g of upcoming) {
    for (const bdlTid of [g.home_team.id, g.visitor_team.id]) {
      const tid = teamId(bdlTid);
      const roster = (playersByTeam.get(tid) ?? []).sort((a, b) => avgMinutes(b) - avgMinutes(a)).slice(0, 4);
      for (const pid of roster) {
        const ls = logsByPlayer.get(pid) ?? [];
        for (const stat of PROJECTABLE) {
          const vals = ls.map((l) => l.stats[stat]).filter((v): v is number => typeof v === "number");
          if (vals.length < 5) continue;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          if (avg < 0.4) continue;
          projections.push({ playerId: pid, gameId: gameId(g.id), stat, line: toLine(avg) });
        }
      }
    }
  }

  // 6) Atomically replace basketball with the real set. Other sports stay as-is.
  await db.$transaction(async (tx) => {
    await tx.projection.deleteMany({ where: { player: { sport: SPORT } } });
    await tx.playerGameLog.deleteMany({ where: { player: { sport: SPORT } } });
    await tx.game.deleteMany({ where: { sport: SPORT } });
    await tx.player.deleteMany({ where: { sport: SPORT } });
    await tx.team.deleteMany({ where: { sport: SPORT } });

    if (teams.length)
      await tx.team.createMany({
        data: teams.map((t) => ({ id: teamId(t.id), sport: SPORT, name: t.full_name || t.name, abbreviation: t.abbreviation, city: t.city ?? t.name, conference: t.conference, division: t.division, pace: null, defRating: null, offRating: null, isDemo: false, source: SOURCE })),
      });
    // Games reference teams; insert them before players so a player's team always exists.
    if (games.length)
      await tx.game.createMany({
        data: games.map((g) => ({ id: gameId(g.id), sport: SPORT, homeTeamId: teamId(g.home_team.id), awayTeamId: teamId(g.visitor_team.id), startsAt: new Date(g.datetime ?? `${g.date}T23:00:00.000Z`), status: mapGameStatus(g.status_state), homeScore: g.home_team_score ?? null, awayScore: g.visitor_team_score ?? null, venue: null, isDemo: false, source: SOURCE })),
      });
    if (players.length)
      await tx.player.createMany({
        data: players.map((p) => ({ id: playerId(p.id), sport: SPORT, teamId: teamId(p.team!.id), name: `${p.first_name} ${p.last_name}`.trim(), position: p.position || "NA", jersey: p.jersey_number || null, injuryStatus: "unknown", injuryNote: null, isDemo: false, source: SOURCE })),
      });
    const chunk = 500;
    for (let i = 0; i < logs.length; i += chunk) {
      await tx.playerGameLog.createMany({ data: logs.slice(i, i + chunk).map((l) => ({ playerId: l.playerId, gameId: l.gameId, date: l.date, isHome: l.isHome, opponentId: l.opponentId, minutes: l.minutes, stats: l.stats })) });
    }
    for (let i = 0; i < projections.length; i += chunk) {
      await tx.projection.createMany({ data: projections.slice(i, i + chunk).map((p) => ({ playerId: p.playerId, gameId: p.gameId, stat: p.stat, line: p.line, source: SOURCE, isDemo: false })) });
    }
  }, { timeout: 60_000, maxWait: 10_000 }); // a networked Postgres needs more than the 5s default for this many rows

  const note =
    tier === "teams_and_schedule"
      ? `Synced real NBA data: ${teams.length} teams and ${games.length} games (real schedule). Live rosters and prop projections need the balldontlie ALL-STAR tier ($9.99/mo); your current key is on the Free tier.`
      : statsTier === "available"
        ? `Synced real NBA data: ${teams.length} teams, ${players.length} players, ${games.length} games, ${logs.length} box-score logs, ${projections.length} projections.`
        : `Synced real NBA teams, players and games (${players.length} players). No recent final games in the window had box scores to build projections from.`;
  return { configured: true, teams: teams.length, players: players.length, games: games.length, logs: logs.length, projections: projections.length, tier, statsTier, note };
}
