/* Live NBA sync from balldontlie: `npm run sync:sports`.
 *
 * Needs BALLDONTLIE_API_KEY in .env (free key at https://balldontlie.io). The free
 * tier gives real teams, players and games; box-score projections need ALL-STAR.
 * On a paid tier set BALLDONTLIE_RPM=60 (ALL-STAR) or 600 (GOAT) to sync faster.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { syncNbaFromBalldontlie } from "../src/lib/data/sports-sync";

async function main() {
  console.log("Syncing real NBA data from balldontlie (public API, throttled to your tier)...");
  const res = await syncNbaFromBalldontlie();
  console.log(res.note);
  console.log(res);
  if (!res.configured) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
