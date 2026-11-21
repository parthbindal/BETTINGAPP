import { z } from "zod";
import { guarded, json } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.object({
  marketMoves: z.boolean(),
  moveThresholdPts: z.number().int().min(1).max(50),
  projectionUpdates: z.boolean(),
  news: z.boolean(),
  upcomingEvents: z.boolean(),
  dataAvailability: z.boolean(),
  emailDigest: z.enum(["none", "daily", "weekly"]),
});

export const PATCH = guarded({ schema: Body, scope: "settings.notifications", limit: 30 }, async (ctx, body) => {
  // Custom thresholds and the daily digest are paid features; the on/off switches are available to everyone.
  const custom = ctx.entitlements.limits.customNotifications;
  const data = {
    ...body,
    moveThresholdPts: custom ? body.moveThresholdPts : 5,
    emailDigest: custom ? body.emailDigest : body.emailDigest === "daily" ? "weekly" : body.emailDigest,
  };
  await db.notificationPreference.upsert({ where: { userId: ctx.user.id }, create: { userId: ctx.user.id, ...data }, update: data });
  return json({ ok: true, message: "Notification preferences saved" });
});
