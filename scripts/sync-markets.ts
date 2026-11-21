/* Full Kalshi market scan from the command line: `npm run sync:markets`. */
import "dotenv/config";
import { db } from "../src/lib/db";
import { syncMarkets } from "../src/lib/data/markets";

async function main() {
  console.log("Scanning Kalshi's open-events feed (public API, throttled). This takes about a minute...");
  const res = await syncMarkets();
  console.log(res);
  if (!res.complete) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
