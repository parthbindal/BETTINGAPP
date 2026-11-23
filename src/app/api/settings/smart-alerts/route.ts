import { z } from "zod";
import { apiError, guarded, json } from "@/lib/api";
import { db } from "@/lib/db";
import { MIN_USD_OPTIONS, RANK_OPTIONS } from "@/lib/smart-alerts-core";

const oneOf = (values: readonly number[]) => z.number().int().refine((v) => values.includes(v), { message: "Not an available option" });

const Body = z.object({
  smartAlerts: z.boolean(),
  smartMinUsd: oneOf(MIN_USD_OPTIONS),
  smartMaxRank: oneOf(RANK_OPTIONS),
  followAlerts: z.boolean(),
});

export const PATCH = guarded({ schema: Body, scope: "settings.smart-alerts", limit: 30 }, async (ctx, body) => {
  if (!ctx.entitlements.limits.smartAlerts) return apiError("Smart-money alerts are part of Pro.", 403);
  await db.notificationPreference.upsert({ where: { userId: ctx.user.id }, create: { userId: ctx.user.id, ...body }, update: body });
  return json({ ok: true, message: "Alert settings saved" });
});
