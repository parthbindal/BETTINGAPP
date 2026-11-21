import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = [
  "/overview",
  "/markets",
  "/sports",
  "/analyst",
  "/research",
  "/academy",
  "/watchlist",
  "/tracker",
  "/community",
  "/scanner",
  "/whales",
  "/compare",
  "/leaderboard",
  "/wallets",
  "/consensus",
  "/activity",
  "/settings",
  "/admin",
  "/notifications",
];

/**
 * Lightweight cookie check for redirects. Full session verification happens in
 * server components and API routes (`requireUser`, `getApiContext`).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Public demo (on unless PUBLIC_DEMO=off): visitors without a session go
  // straight into the read-only demo account instead of the sign-in screen.
  // Admin pages are never part of the demo.
  const demoOn = process.env.PUBLIC_DEMO !== "off";
  if (demoOn && !sessionCookie && (pathname === "/" || (isProtected && !pathname.startsWith("/admin")))) {
    const url = new URL("/demo", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isProtected && !sessionCookie) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // A demo visitor may still open sign-in / sign-up to switch to a real account.
  const inDemo = request.cookies.get("edgewise_demo")?.value === "1";
  if ((pathname === "/sign-in" || pathname === "/sign-up") && sessionCookie && !inDemo) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
