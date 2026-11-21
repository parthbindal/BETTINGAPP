import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { addWatchlistItem, removeWatchlistItem } from "@/lib/watchlist";
import { getMarketsByTickers } from "@/lib/data/markets";
import { getWhaleWatch } from "@/lib/whales";
import { isWalletAddress, shortAddress } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";

const AddBody = z.object({
  kind: z.enum(["market", "event", "player", "team", "stat", "topic", "wallet"]),
  refId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(200),
});

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export const POST = guarded({ schema: AddBody, scope: "watchlist.add", limit: 40 }, async (ctx, body) => {
  let { refId, label } = body;
  // Labels for known entities come from the database, not the client.
  if (body.kind === "market") {
    const [m] = await getMarketsByTickers([refId.toUpperCase()]);
    if (!m) return apiError("Market not found.", 404);
    refId = m.ticker;
    label = `${m.title}${m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}`;
  } else if (body.kind === "player") {
    const p = await db.player.findUnique({ where: { id: refId } });
    if (!p) return apiError("Player not found.", 404);
    label = p.name;
  } else if (body.kind === "team") {
    const t = await db.team.findUnique({ where: { id: refId } });
    if (!t) return apiError("Team not found.", 404);
    label = t.name;
  } else if (body.kind === "event") {
    const g = await db.game.findUnique({ where: { id: refId }, include: { homeTeam: true, awayTeam: true } });
    if (!g) return apiError("Game not found.", 404);
    label = `${g.awayTeam.name} at ${g.homeTeam.name}`;
  } else if (body.kind === "wallet") {
    if (!isWalletAddress(refId)) return apiError("That is not a valid wallet address.", 422);
    refId = refId.toLowerCase();
    const whale = await getWhaleWatch();
    const stat = whale?.payload.wallets?.find((w) => w.wallet.toLowerCase() === refId);
    label = stat?.name ?? shortAddress(refId);
  } else {
    refId = slug(label);
    if (!refId) return apiError("Please enter a topic.", 422);
  }
  const r = await addWatchlistItem(ctx.user.id, body.kind, refId, label, ctx.entitlements.limits.watchlistMax);
  if (!r.ok) return apiError(`${r.reason} Remove an item or upgrade for more capacity.`, 402, { upgrade: true });
  if (r.created) trackUsage("watchlist.add", ctx.user.id, { kind: body.kind });
  return json({ ok: true, id: r.item.id });
});

const DelBody = z.object({ id: z.string().max(64).optional(), kind: z.string().max(16).optional(), refId: z.string().max(160).optional() });

export const DELETE = guarded({ schema: DelBody, scope: "watchlist.remove", limit: 60 }, async (ctx, body) => {
  if (body.id) await removeWatchlistItem(ctx.user.id, body.id);
  else if (body.kind && body.refId) await db.watchlistItem.deleteMany({ where: { userId: ctx.user.id, kind: body.kind, refId: body.refId } });
  else return apiError("Nothing to remove.", 422);
  return json({ ok: true, message: "Removed from watchlist" });
});
