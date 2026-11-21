import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { DEMO_READ_ONLY_MESSAGE, isDemoUser } from "@/lib/demo";

const handlers = toNextJsHandler(auth.handler);

export const GET = handlers.GET;

/**
 * The shared demo session may only sign out or switch to a real account; every
 * other account mutation (password, email, profile, sessions, deletion, admin
 * plugin endpoints) is refused so visitors cannot take over or alter it.
 */
const DEMO_ALLOWED = ["/api/auth/sign-out", "/api/auth/sign-in/", "/api/auth/sign-up/"];

export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  if (!DEMO_ALLOWED.some((p) => path === p || path.startsWith(p))) {
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
    if (isDemoUser(session?.user)) {
      return Response.json({ message: DEMO_READ_ONLY_MESSAGE, code: "DEMO_READ_ONLY" }, { status: 403 });
    }
  }
  return handlers.POST(req);
}
