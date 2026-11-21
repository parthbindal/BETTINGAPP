import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { PLANS, isTier } from "@/lib/subscriptions/plans";

const Body = z.object({ tier: z.string(), key: z.string().max(48), value: z.union([z.number().int().min(0).max(1_000_000), z.boolean()]) });

/** Override a numeric or boolean plan limit without a deploy. */
export const POST = guarded({ schema: Body, scope: "admin.limits", admin: true, limit: 60 }, async (_ctx, body) => {
  if (!isTier(body.tier)) return apiError("Unknown plan.", 422);
  const defaults = PLANS[body.tier].limits as unknown as Record<string, unknown>;
  if (!(body.key in defaults)) return apiError("Unknown limit.", 422);
  const expected = typeof defaults[body.key];
  if (expected !== "number" && expected !== "boolean") return apiError("Only numeric and on/off limits can be overridden here.", 422);
  if (typeof body.value !== expected) return apiError(`This limit expects a ${expected}.`, 422);
  const key = `${body.tier}.${body.key}`;
  await db.featureLimitOverride.upsert({ where: { key }, create: { key, value: body.value }, update: { value: body.value } });
  return json({ ok: true, message: `Override saved for ${key}` });
});

export const DELETE = guarded({ scope: "admin.limits.delete", admin: true }, async (_ctx, _body, req) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return apiError("Missing key.", 422);
  await db.featureLimitOverride.deleteMany({ where: { key } });
  return json({ ok: true, message: "Override removed; plan default restored" });
});
