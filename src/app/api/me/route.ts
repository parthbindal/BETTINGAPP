import { getApiContext } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Member chrome data: name, plan and unread count. The app shell fetches this
 * after hydration (see AccountProvider), so no request-time read happens in a layout.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ signedIn: false }, { headers });
  const unread = await db.notification.count({ where: { userId: ctx.user.id, readAt: null } });
  return Response.json(
    {
      signedIn: true,
      user: { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role ?? "user" },
      tier: ctx.entitlements.tier,
      unread,
    },
    { headers },
  );
}
