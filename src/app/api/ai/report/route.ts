import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { generateReport, countReportsThisMonth } from "@/lib/ai/reports";
import { awardAchievement } from "@/lib/academy";
import { db } from "@/lib/db";

export const maxDuration = 120;

const Body = z.object({
  subjectKind: z.enum(["market", "player"]),
  subjectRef: z.string().trim().min(1).max(120),
  stat: z.string().max(24).optional(),
  line: z.number().min(0).max(2000).optional(),
});

export const POST = guarded({ schema: Body, scope: "ai.report", limit: 6, windowMs: 60_000 }, async (ctx, body) => {
  const limit = ctx.entitlements.limits.reportsPerMonth;
  const used = await countReportsThisMonth(ctx.user.id);
  if (used >= limit) {
    return apiError(`You have generated ${used} of ${limit} research reports this month on the ${ctx.entitlements.tier} plan.`, 402, { upgrade: true });
  }
  try {
    const { id, mode } = await generateReport({ userId: ctx.user.id, ctx: { userId: ctx.user.id, limits: ctx.entitlements.limits }, ...body });
    // Awaited: this row is what the monthly quota counts.
    await db.usageEvent.create({ data: { userId: ctx.user.id, feature: "report.generate", meta: { kind: body.subjectKind, mode } } });
    await awardAchievement(ctx.user.id, "first_report");
    return json({ id, mode });
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return apiError("That market or player could not be found.", 404);
    throw e;
  }
});

export const DELETE = guarded({ scope: "ai.report.delete" }, async (ctx, _body, req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing report id.", 422);
  await db.researchReport.deleteMany({ where: { id, userId: ctx.user.id } });
  return json({ ok: true, url: "/research" });
});
