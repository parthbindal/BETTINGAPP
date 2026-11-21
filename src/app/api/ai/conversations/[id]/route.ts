import { getApiContext } from "@/lib/session";
import { DEMO_READ_ONLY_MESSAGE, isDemoUser } from "@/lib/demo";
import { db } from "@/lib/db";
import { apiError, json } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  if (isDemoUser(ctx.user)) return apiError(DEMO_READ_ONLY_MESSAGE, 403, { demo: true });
  const { id } = await params;
  await db.aiConversation.deleteMany({ where: { id, userId: ctx.user.id } });
  return json({ ok: true });
}
