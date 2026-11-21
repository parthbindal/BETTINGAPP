/**
 * In-memory sliding-window rate limiter for API routes. Suitable for a single
 * Node process; swap the store for Redis (e.g. Upstash) when running multiple
 * instances. Keys are user ids or client IPs.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, remaining: 0, resetMs: windowMs - (now - arr[0]!) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1]! > windowMs) buckets.delete(k);
  }
  return { ok: true, remaining: limit - arr.length, resetMs: windowMs };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
