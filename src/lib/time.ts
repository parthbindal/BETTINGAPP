/**
 * Clock helpers for request-time code. Server components call these (after
 * reading the session, so never during prerender) instead of touching
 * Date.now() in the component body.
 */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

export function isPast(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return Number.isFinite(t) && t <= Date.now();
}
