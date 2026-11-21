import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.object({ threadId: z.string().max(64), value: z.union([z.literal(1), z.literal(0)]) });

/** Toggle a "useful" vote on a discussion. One vote per member. */
export const POST = guarded({ schema: Body, scope: "community.vote", limit: 120 }, async (ctx, body) => {
  const thread = await db.communityThread.findUnique({ where: { id: body.threadId }, select: { id: true } });
  if (!thread) return apiError("Discussion not found.", 404);
  if (body.value === 1) {
    await db.communityVote.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: ctx.user.id } },
      create: { threadId: thread.id, userId: ctx.user.id, value: 1 },
      update: { value: 1 },
    });
  } else {
    await db.communityVote.deleteMany({ where: { threadId: thread.id, userId: ctx.user.id } });
  }
  const agg = await db.communityVote.aggregate({ where: { threadId: thread.id }, _sum: { value: true } });
  const score = agg._sum.value ?? 0;
  await db.communityThread.update({ where: { id: thread.id }, data: { score } });
  return json({ ok: true, score });
});
