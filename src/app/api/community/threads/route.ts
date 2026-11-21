import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { checkCommunityContent } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { trackUsage } from "@/lib/ops";

const Body = z.object({
  title: z.string().trim().min(5).max(140),
  body: z.string().trim().min(10).max(5000),
  kind: z.enum(["market", "sports", "learning", "general"]),
  refId: z.string().trim().max(160).optional(),
});

export const POST = guarded({ schema: Body, scope: "community.thread" }, async (ctx, body) => {
  if (!rateLimit(`community.thread.hour:${ctx.user.id}`, 5, 3600_000).ok) return apiError("You can start up to 5 discussions per hour.", 429);
  const check = checkCommunityContent(`${body.title}\n${body.body}`);
  if (!check.ok) return apiError(check.reason, 422);
  const thread = await db.communityThread.create({ data: { userId: ctx.user.id, title: body.title, body: body.body, kind: body.kind, refId: body.refId || null } });
  trackUsage("community.thread", ctx.user.id, { kind: body.kind });
  return json({ ok: true, id: thread.id, url: `/community/${thread.id}` });
});

/** Authors can remove their own discussion; admins can remove any. */
export const DELETE = guarded({ scope: "community.thread.delete" }, async (ctx, _body, req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing id.", 422);
  const thread = await db.communityThread.findUnique({ where: { id } });
  if (!thread) return apiError("Discussion not found.", 404);
  if (thread.userId !== ctx.user.id && ctx.user.role !== "admin") return apiError("Not allowed.", 403);
  await db.communityThread.delete({ where: { id } });
  return json({ ok: true, url: "/community" });
});
