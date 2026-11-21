import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getApiContext } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/ops";
import { DEMO_READ_ONLY_MESSAGE, isDemoUser } from "@/lib/demo";

export type ApiContext = NonNullable<Awaited<ReturnType<typeof getApiContext>>>;

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Standard guarded handler: authenticates, rate-limits per user, validates the
 * body against a Zod schema, and logs unexpected errors.
 */
export function guarded<TBody>(
  opts: { schema?: ZodType<TBody>; limit?: number; windowMs?: number; admin?: boolean; scope: string },
  handler: (ctx: ApiContext, body: TBody, req: Request) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const ctx = await getApiContext();
      if (!ctx) return apiError("Sign in required.", 401);
      if (opts.admin && ctx.user.role !== "admin") return apiError("Admin access required.", 403);
      if (isDemoUser(ctx.user) && (opts.admin || req.method !== "GET")) return apiError(DEMO_READ_ONLY_MESSAGE, 403, { demo: true });
      const rl = rateLimit(`${opts.scope}:${ctx.user.id}`, opts.limit ?? 60, opts.windowMs ?? 60_000);
      if (!rl.ok) return apiError("Too many requests. Please slow down.", 429, { retryAfterMs: rl.resetMs });
      let body = undefined as TBody;
      if (opts.schema) {
        let raw: unknown = {};
        if (req.method !== "GET") {
          try {
            raw = await req.json();
          } catch {
            raw = {};
          }
        } else {
          raw = Object.fromEntries(new URL(req.url).searchParams.entries());
        }
        body = opts.schema.parse(raw);
      }
      return await handler(ctx, body, req);
    } catch (e) {
      if (e instanceof ZodError) return apiError("Invalid request.", 422, { issues: e.issues });
      await logError(opts.scope, e);
      return apiError("Something went wrong.", 500);
    }
  };
}

/** Public (unauthenticated) handler with IP rate limiting. */
export function publicGuarded<TBody>(
  opts: { schema?: ZodType<TBody>; limit?: number; windowMs?: number; scope: string },
  handler: (body: TBody, req: Request) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const rl = rateLimit(`${opts.scope}:${clientIp(req)}`, opts.limit ?? 60, opts.windowMs ?? 60_000);
      if (!rl.ok) return apiError("Too many requests.", 429);
      let body = undefined as TBody;
      if (opts.schema) {
        const raw = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams.entries()) : await req.json().catch(() => ({}));
        body = opts.schema.parse(raw);
      }
      return await handler(body, req);
    } catch (e) {
      if (e instanceof ZodError) return apiError("Invalid request.", 422, { issues: e.issues });
      await logError(opts.scope, e);
      return apiError("Something went wrong.", 500);
    }
  };
}
