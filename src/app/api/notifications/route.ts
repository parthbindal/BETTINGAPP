import { z } from "zod";
import { guarded, json } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.object({ id: z.string().max(64).optional(), all: z.boolean().optional() });

/** Mark one notification, or all of them, as read. */
export const POST = guarded({ schema: Body, scope: "notifications.read", limit: 120 }, async (ctx, body) => {
  await db.notification.updateMany({
    where: { userId: ctx.user.id, readAt: null, ...(body.all ? {} : { id: body.id ?? "__none__" }) },
    data: { readAt: new Date() },
  });
  return json({ ok: true });
});
