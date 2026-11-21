import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getMarketsByTickers } from "@/lib/data/markets";
import { impliedProbability } from "@/lib/data/types";
import { analyzePlayerProjection, statLabel } from "@/lib/data/sports";
import { isLocked } from "@/lib/tracker";
import { awardAchievement } from "@/lib/academy";
import { trackUsage } from "@/lib/ops";
import { dateShort } from "@/lib/format";

const prob = z.number().min(0.01).max(0.99);
const notes = z.string().trim().max(500).optional();
const Body = z.discriminatedUnion("domain", [
  z.object({ domain: z.literal("market"), ticker: z.string().trim().min(1).max(120), side: z.enum(["yes", "no"]), predictedProb: prob, notes }),
  z.object({ domain: z.literal("sports"), playerId: z.string().min(1).max(80), stat: z.string().min(1).max(24), line: z.number().min(0).max(2000), side: z.enum(["over", "under"]), predictedProb: prob, notes }),
]);

/**
 * Create a forecast. The market and model reference probabilities, the lock
 * time and the question text are all derived on the server at this moment, so
 * the record that later gets scored cannot be shaped by the client.
 */
export const POST = guarded({ schema: Body, scope: "predictions.create", limit: 30 }, async (ctx, body) => {
  let refId: string;
  let question: string;
  let category: string;
  let marketProb: number | null = null;
  let modelProb: number | null = null;
  let modelVersion: string | null = null;
  let lockedAt: Date | null;
  let resolvesAt: Date | null;

  if (body.domain === "market") {
    const [m] = await getMarketsByTickers([body.ticker.toUpperCase()]);
    if (!m) return apiError("Market not found.", 404);
    const closeAt = m.closeTime ? new Date(m.closeTime) : null;
    if (m.result || (closeAt && closeAt.getTime() <= Date.now())) return apiError("Trading has closed for this market, so new predictions are not accepted.", 409);
    const forSide = (p: number | null | undefined) => (p === null || p === undefined ? null : body.side === "yes" ? p : 1 - p);
    const est = await db.modelEstimate.findFirst({ where: { ticker: m.ticker, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, orderBy: { createdAt: "desc" } });
    refId = m.ticker;
    question = `${m.title}${m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}`;
    category = m.category;
    marketProb = forSide(impliedProbability(m));
    modelProb = forSide(est?.estimate);
    modelVersion = est?.modelVersion ?? null;
    lockedAt = closeAt;
    resolvesAt = m.expirationTime ? new Date(m.expirationTime) : closeAt;
  } else {
    const r = await analyzePlayerProjection(body.playerId, body.stat, body.line);
    if (!r) return apiError("Player not found.", 404);
    if (!r.profile.statKeys.includes(body.stat)) return apiError("Unknown statistic for this sport.", 422);
    const game = r.profile.upcoming;
    if (!game || game.startsAt.getTime() <= Date.now()) return apiError("No upcoming game is scheduled for this player.", 409);
    const over = r.analysis.estimate.probOver;
    refId = `${body.playerId}:${body.stat}:${body.line}:${game.id}`;
    question = `${r.profile.player.name}: ${statLabel(r.profile.player.sport, body.stat)} over/under ${body.line} (${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}, ${dateShort(game.startsAt)})`;
    category = r.profile.player.sport;
    modelProb = Number.isFinite(over) ? (body.side === "over" ? over : 1 - over) : null;
    modelVersion = r.analysis.modelVersion;
    lockedAt = game.startsAt;
    resolvesAt = new Date(game.startsAt.getTime() + 3 * 3600_000);
  }

  const existing = await db.prediction.findFirst({ where: { userId: ctx.user.id, refId, outcome: null, resolutionSource: null } });
  if (existing) return apiError("You already have an open prediction on this. Delete it before it locks if you want to replace it.", 409);

  const created = await db.prediction.create({
    data: { userId: ctx.user.id, domain: body.domain, refId, question, category, side: body.side, predictedProb: body.predictedProb, marketProb, modelProb, modelVersion, notes: body.notes || null, lockedAt, resolvesAt },
  });
  await awardAchievement(ctx.user.id, "first_prediction");
  trackUsage("prediction.create", ctx.user.id, { domain: body.domain });
  return json({ ok: true, id: created.id });
});

/** Predictions are immutable. They may be withdrawn only before they lock. */
export const DELETE = guarded({ scope: "predictions.delete", limit: 30 }, async (ctx, _body, req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing prediction id.", 422);
  const p = await db.prediction.findFirst({ where: { id, userId: ctx.user.id } });
  if (!p) return apiError("Prediction not found.", 404);
  if (isLocked(p)) return apiError("This prediction is locked and can no longer be changed or removed.", 409);
  await db.prediction.delete({ where: { id: p.id } });
  return json({ ok: true, message: "Prediction withdrawn" });
});
