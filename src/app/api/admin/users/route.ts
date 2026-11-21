import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), userId: z.string().max(64), tier: z.literal("pro"), months: z.number().int().min(1).max(36), note: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("revoke"), userId: z.string().max(64) }),
  z.object({ action: z.literal("setRole"), userId: z.string().max(64), role: z.enum(["admin", "user"]) }),
  z.object({ action: z.literal("ban"), userId: z.string().max(64), reason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("unban"), userId: z.string().max(64) }),
]);

export const PATCH = guarded({ schema: Body, scope: "admin.users", admin: true, limit: 60 }, async (ctx, body) => {
  const target = await db.user.findUnique({ where: { id: body.userId }, include: { subscription: true } });
  if (!target) return apiError("User not found.", 404);

  switch (body.action) {
    case "grant": {
      const sub = target.subscription;
      if (sub?.source === "stripe" && ["active", "trialing", "past_due"].includes(sub.status)) {
        return apiError("This user has an active Stripe subscription. Change it in Stripe so billing stays consistent.", 409);
      }
      const end = new Date(Date.now() + body.months * 30 * 86400_000);
      const data = { tier: body.tier, status: "active", source: "complimentary", currentPeriodEnd: end, cancelAtPeriodEnd: false, grantedById: ctx.user.id, grantNote: body.note || "Complimentary grant" };
      await db.subscription.upsert({ where: { userId: target.id }, create: { userId: target.id, ...data }, update: data });
      await db.notification.create({ data: { userId: target.id, type: "system", title: `Complimentary Pro access`, body: `An administrator granted you ${body.months} month${body.months === 1 ? "" : "s"} of access. No payment is required.`, href: "/settings/subscription" } });
      return json({ ok: true, message: `Granted ${body.tier} for ${body.months} month(s)` });
    }
    case "revoke": {
      if (target.subscription?.source !== "complimentary") return apiError("Only complimentary grants can be revoked here.", 409);
      await db.subscription.update({ where: { userId: target.id }, data: { tier: "free", status: "active", source: "none", currentPeriodEnd: null, grantedById: null, grantNote: null } });
      return json({ ok: true, message: "Complimentary access revoked" });
    }
    case "setRole": {
      if (target.id === ctx.user.id && body.role !== "admin") return apiError("You cannot remove your own admin role.", 409);
      await db.user.update({ where: { id: target.id }, data: { role: body.role } });
      // Force a fresh session so the cached role is not used.
      await db.session.deleteMany({ where: { userId: target.id, NOT: { userId: ctx.user.id } } });
      return json({ ok: true, message: `Role set to ${body.role}` });
    }
    case "ban": {
      if (target.id === ctx.user.id) return apiError("You cannot ban yourself.", 409);
      await db.user.update({ where: { id: target.id }, data: { banned: true, banReason: body.reason || "Violation of terms" } });
      await db.session.deleteMany({ where: { userId: target.id } });
      return json({ ok: true, message: "User banned and signed out" });
    }
    case "unban": {
      await db.user.update({ where: { id: target.id }, data: { banned: false, banReason: null, banExpires: null } });
      return json({ ok: true, message: "User unbanned" });
    }
  }
});
