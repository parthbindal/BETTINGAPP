/* Seed: fictional demo sports data (labeled isDemo), platform updates, and an initial Kalshi market sync. */
import "dotenv/config";
import { db } from "../src/lib/db";
import { generateDemoData } from "../src/lib/data/providers/sports-demo";
import { syncMarkets } from "../src/lib/data/markets";

async function seedSports() {
  const existing = await db.team.count({ where: { isDemo: true } });
  if (existing > 0) {
    console.log(`demo sports data already present (${existing} teams); skipping`);
    return;
  }
  const data = generateDemoData(new Date());
  console.log(`generating demo sports: ${data.teams.length} teams, ${data.players.length} players, ${data.games.length} games, ${data.logs.length} logs, ${data.projections.length} projections`);
  await db.team.createMany({
    data: data.teams.map((t) => ({ id: t.id, sport: t.sport, name: t.name, abbreviation: t.abbreviation, city: t.city, conference: t.conference, division: t.division, pace: t.pace, defRating: t.defRating, offRating: t.offRating, isDemo: true, source: "demo" })),
  });
  await db.player.createMany({
    data: data.players.map((p) => ({ id: p.id, sport: p.sport, teamId: p.teamId, name: p.name, position: p.position, jersey: p.jersey, injuryStatus: p.injuryStatus, injuryNote: p.injuryNote, isDemo: true, source: "demo" })),
  });
  await db.game.createMany({
    data: data.games.map((g) => ({ id: g.id, sport: g.sport, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, startsAt: g.startsAt, status: g.status, homeScore: g.homeScore, awayScore: g.awayScore, venue: g.venue, isDemo: true, source: "demo" })),
  });
  const chunk = 500;
  for (let i = 0; i < data.logs.length; i += chunk) {
    await db.playerGameLog.createMany({
      data: data.logs.slice(i, i + chunk).map((l) => ({ playerId: l.playerId, gameId: l.gameId, date: l.date, isHome: l.isHome, opponentId: l.opponentId, minutes: l.minutes, stats: l.stats })),
    });
  }
  await db.projection.createMany({ data: data.projections.map((p) => ({ playerId: p.playerId, gameId: p.gameId, stat: p.stat, line: p.line, source: "demo", isDemo: true })) });
  console.log("demo sports seeded");
}

async function seedPlatformUpdates() {
  if ((await db.platformUpdate.count()) > 0) return;
  await db.platformUpdate.createMany({
    data: [
      { title: "Market Intelligence", body: "Market pages now show EDGEWISE's own accumulated price snapshots alongside exchange candles." },
      { title: "Projection analysis", body: "Projection analysis reports Wilson intervals, a minutes-trend flag and defense splits." },
      { title: "AI Analyst", body: "The analyst falls back to a clearly labeled rule-based mode when no AI provider is configured." },
    ],
  });
  console.log("platform updates seeded");
}

async function main() {
  await seedPlatformUpdates();
  await seedSports();
  console.log("syncing Kalshi markets (public API, full scan, about a minute)...");
  const res = await syncMarkets();
  console.log(`markets synced: ${res.marketsSeen} active markets across ${res.eventsWithActivity} events in ${(res.ms / 1000).toFixed(0)}s (complete: ${res.complete})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
