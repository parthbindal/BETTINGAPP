import "dotenv/config";
import { syncWhaleWatch } from "../src/lib/whales";

syncWhaleWatch()
  .then((r) => { console.log(`whale scan: ${r.tradersScanned} traders, ${r.positionsScanned} positions, ${r.holdings} holdings`); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
