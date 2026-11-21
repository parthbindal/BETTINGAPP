import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(5).max(400) });

/** Platform updates shown on every member's Overview. */
export const POST = guarded({ schema: Body, scope: "admin.updates", admin: true, limit: 30 }, async (_ctx, body) => {
  await db.platformUpdate.create({ data: body });
  return json({ ok: true, message: "Update published" });
});

export const DELETE = guarded({ scope: "admin.updates.delete", admin: true }, async (_ctx, _body, req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError("Missing id.", 422);
  await db.platformUpdate.deleteMany({ where: { id } });
  return json({ ok: true, message: "Update removed" });
});
