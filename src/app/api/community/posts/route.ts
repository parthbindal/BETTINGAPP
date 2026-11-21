import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { checkCommunityContent } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({ threadId: z.string().max(64), body: z.string().trim().min(2).max(3000) });

export const POST = guarded({ schema: Body, scope: "community.post" }, async (ctx, body) => {
  if (!rateLimit(`community.post.hour:${ctx.user.id}`, 30, 3600_000).ok) return apiError("You are posting too quickly. Please slow down.", 429);
  const thread = await db.communityThread.findUnique({ where: { id: body.threadId }, select: { id: true } });
  if (!thread) return apiError("Discussion not found.", 404);
  const check = checkCommunityContent(body.body);
  if (!check.ok) return apiError(check.reason, 422);
  await db.$transaction([
    db.communityPost.create({ data: { threadId: thread.id, userId: ctx.user.id, body: body.body } }),
    db.communityThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } }),
  ]);
  return json({ ok: true, message: "Reply posted" });
});

export const DELETE = guarded({ scope: "community.post.delete" }, async (ctx, _body, req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing id.", 422);
  const post = await db.communityPost.findUnique({ where: { id } });
  if (!post) return apiError("Reply not found.", 404);
  if (post.userId !== ctx.user.id && ctx.user.role !== "admin") return apiError("Not allowed.", 403);
  await db.communityPost.delete({ where: { id } });
  return json({ ok: true, message: "Reply removed" });
});
