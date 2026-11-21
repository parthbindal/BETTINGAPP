/**
 * DEMO ONLY. Finalizes fictional scheduled games after their start time by
 * simulating box scores from each player's own game-log distribution, so the
 * prediction → resolution → scoring loop can be exercised end to end before a
 * licensed results feed is connected. Rows stay flagged isDemo and predictions
 * resolved this way are labeled resolutionSource = "demo". Real games are
 * never touched.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { mean, stdev } from "@/lib/analytics/stats";

const GAME_DURATION_MS = 3 * 3600_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function normal(rng: () => number, mu: number, sigma: number) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(rng: () => number, lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export async function finalizeDueDemoGames(limit = 25): Promise<{ finalized: number }> {
  const due = await db.game.findMany({
    where: { isDemo: true, status: "scheduled", startsAt: { lte: new Date(Date.now() - GAME_DURATION_MS) } },
    orderBy: { startsAt: "asc" },
    take: limit,
  });
  let finalized = 0;
  for (const game of due) {
    const rng = mulberry32(hashString(game.id)); // deterministic per game
    const players = await db.player.findMany({
      where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
      include: { gameLogs: { orderBy: { date: "desc" }, take: 30 } },
    });
    const rows: Prisma.PlayerGameLogCreateManyInput[] = [];
    const totals: Record<string, number> = { [game.homeTeamId]: 0, [game.awayTeamId]: 0 };
    for (const p of players) {
      if (p.injuryStatus === "out" || p.gameLogs.length === 0) continue;
      const isHome = p.teamId === game.homeTeamId;
      const mins = p.gameLogs.map((l) => l.minutes);
      const minutes = Math.max(0, Math.round(normal(rng, mean(mins), Math.max(1, stdev(mins))) * 10) / 10);
      const sample = p.gameLogs[0]!.stats as Record<string, number>;
      const stats: Record<string, number> = {};
      for (const k of Object.keys(sample)) {
        if (k === "pra" || (p.sport === "hockey" && k === "pts")) continue; // derived below
        const vals = p.gameLogs.map((l) => (l.stats as Record<string, number>)[k] ?? 0);
        const mu = mean(vals);
        stats[k] = mu < 2 ? poisson(rng, Math.max(0.01, mu)) : Math.max(0, Math.round(normal(rng, mu, stdev(vals) || 1)));
      }
      if (p.sport === "basketball") stats.pra = (stats.pts ?? 0) + (stats.reb ?? 0) + (stats.ast ?? 0);
      if (p.sport === "hockey") stats.pts = (stats.goals ?? 0) + (stats.ast ?? 0);
      rows.push({ playerId: p.id, gameId: game.id, date: game.startsAt, isHome, opponentId: isHome ? game.awayTeamId : game.homeTeamId, minutes, stats });
      const scoreKey = game.sport === "basketball" ? "pts" : game.sport === "football" ? null : "goals";
      if (scoreKey) totals[p.teamId] = (totals[p.teamId] ?? 0) + (stats[scoreKey] ?? 0);
    }
    let home = totals[game.homeTeamId] ?? 0;
    let away = totals[game.awayTeamId] ?? 0;
    if (game.sport === "football") {
      home = Math.max(0, Math.round(normal(rng, 23, 8)));
      away = Math.max(0, Math.round(normal(rng, 21, 8)));
    }
    if (game.sport === "basketball") {
      // the demo roster lists eight players; add a bench contribution
      home += 24 + Math.round(rng() * 12);
      away += 24 + Math.round(rng() * 12);
      if (home === away) home += 1;
    }
    await db.$transaction([
      db.playerGameLog.createMany({ data: rows }),
      db.game.update({ where: { id: game.id }, data: { status: "final", homeScore: home, awayScore: away } }),
    ]);
    finalized++;
  }
  return { finalized };
}
