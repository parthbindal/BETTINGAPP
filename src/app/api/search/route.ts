import { connection } from "next/server";
import { guarded, json } from "@/lib/api";
import { getWhaleWatch } from "@/lib/whales";

const FREE_TRADERS = 25;

/**
 * The ⌘K palette's search index: every tracked trader (name, wallet, rank,
 * all-time profit) and every live signal, fetched once when the palette first
 * opens and filtered in the browser. Free plans get the same slice they can see
 * on Top Traders and no signals, which are a Pro feature.
 */
const index = guarded({ scope: "search.index", limit: 30 }, async (ctx) => {
  const whale = await getWhaleWatch();
  const pro = ctx.entitlements.limits.scanner;
  if (!whale) return json({ traders: [], signals: [], pro }, { headers: { "Cache-Control": "private, no-store" } });
  const p = whale.payload;
  const traders = [...(p.wallets ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, pro ? undefined : FREE_TRADERS)
    .map((w) => ({ wallet: w.wallet, name: w.name, rank: w.rank, pnl: Math.round(w.pnl) }));
  const signals = pro
    ? p.holdings
        .filter((h) => h.holders >= 2)
        .sort((a, b) => b.totalValue - a.totalValue)
        .map((h) => ({ tokenId: h.tokenId, title: h.title, outcome: h.outcome, holders: h.holders, totalValue: Math.round(h.totalValue), category: h.category }))
    : [];
  return json({ traders, signals, pro }, { headers: { "Cache-Control": "private, no-store" } });
});

/**
 * Per-user and per-request. connection() marks the route dynamic up front:
 * without it the build prerendered GET, guarded() caught the request-API
 * rejection as an error, and a static 500 would have shipped.
 */
export async function GET(req: Request) {
  await connection();
  return index(req);
}
