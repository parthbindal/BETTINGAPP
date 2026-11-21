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

  if (isProtected && !sessionCookie) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/sign-in" || pathname === "/sign-up") && sessionCookie) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
