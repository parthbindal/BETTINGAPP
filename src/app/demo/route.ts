import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_EMAIL, DEMO_MARKER_COOKIE, DEMO_NAME, demoNextPath, demoPassword, isDemoEnabled, prepareDemoUser } from "@/lib/demo";
import { logError } from "@/lib/ops";

/**
 * GET /demo?next=/consensus — signs the visitor into the shared read-only demo
 * account and sends them to the requested page. Creates the account on first
 * use. Session cookies come from Better Auth itself, so the visitor gets an
 * ordinary, server-verified session (scoped by everything in lib/demo.ts).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isDemoEnabled()) return NextResponse.redirect(new URL("/sign-in", url));
  const next = demoNextPath(url.searchParams.get("next"));

  try {
    const password = demoPassword();
    let user = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
    if (!user) {
      await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password, name: DEMO_NAME, dateOfBirth: new Date("1990-01-01") } as never,
      });
      user = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
      if (!user) throw new Error("demo user was not created");
    }
    await prepareDemoUser(user.id);

    let res = await auth.api.signInEmail({ body: { email: DEMO_EMAIL, password }, headers: req.headers, asResponse: true });
    if (!res.ok) {
      // The server secret changed since the account was made: reset its password and retry.
      const ctx = await auth.$context;
      await ctx.internalAdapter.updatePassword(user.id, await ctx.password.hash(password));
      res = await auth.api.signInEmail({ body: { email: DEMO_EMAIL, password }, headers: req.headers, asResponse: true });
      if (!res.ok) throw new Error(`demo sign-in failed: ${res.status}`);
    }

    const out = NextResponse.redirect(new URL(next, url));
    for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
    out.cookies.set(DEMO_MARKER_COOKIE, "1", { path: "/", sameSite: "lax", secure: url.protocol === "https:", maxAge: 60 * 60 * 24 * 30 });
    return out;
  } catch (e) {
    await logError("demo.signin", e);
    return NextResponse.redirect(new URL("/sign-in", url));
  }
}
