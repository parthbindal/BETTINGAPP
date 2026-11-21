import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** Persist an error for the admin error monitor; never throws. */
export async function logError(scope: string, err: unknown, meta?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  console.error(`[${scope}]`, message);
  try {
    await db.errorLog.create({ data: { scope, message, stack, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined } });
  } catch {
    /* logging must never break the request */
  }
}

export async function recordProviderHealth(provider: string, ok: boolean, latencyMs: number, error?: string) {
  try {
    const existing = await db.providerHealth.findUnique({ where: { provider } });
    const sameDay = existing?.updatedAt && existing.updatedAt.toDateString() === new Date().toDateString();
    const callsToday = (sameDay ? existing?.callsToday ?? 0 : 0) + 1;
    await db.providerHealth.upsert({
      where: { provider },
      create: {
        provider,
        status: ok ? "ok" : "down",
        lastSuccessAt: ok ? new Date() : null,
        lastErrorAt: ok ? null : new Date(),
        lastError: ok ? null : error ?? null,
        latencyMs,
        callsToday,
      },
      update: {
        status: ok ? "ok" : existing?.lastSuccessAt && Date.now() - existing.lastSuccessAt.getTime() < 3600_000 ? "degraded" : "down",
        lastSuccessAt: ok ? new Date() : undefined,
        lastErrorAt: ok ? undefined : new Date(),
        lastError: ok ? null : error ?? null,
        latencyMs,
        callsToday,
      },
    });
  } catch {
    /* ignore */
  }
}

export async function setProviderUnconfigured(provider: string, note: string) {
  try {
    await db.providerHealth.upsert({
      where: { provider },
      create: { provider, status: "unconfigured", lastError: note },
      update: { status: "unconfigured", lastError: note },
    });
  } catch {
    /* ignore */
  }
}

/** Feature usage event for the admin dashboard. Fire-and-forget. */
export function trackUsage(feature: string, userId?: string | null, meta?: Record<string, unknown>) {
  db.usageEvent
    .create({ data: { feature, userId: userId ?? null, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined } })
    .catch(() => {});
}

/** Wrap a provider call: timing + health recording. */
export async function withProvider<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    await recordProviderHealth(provider, true, Date.now() - start);
    return out;
  } catch (e) {
    await recordProviderHealth(provider, false, Date.now() - start, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
