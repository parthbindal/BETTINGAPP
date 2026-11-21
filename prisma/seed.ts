/* Seed: platform updates and an initial Kalshi market sync. Sports come from `npm run sync:sports` (real NBA data). */
import "dotenv/config";
import { db } from "../src/lib/db";
import { syncMarkets } from "../src/lib/data/markets";

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
