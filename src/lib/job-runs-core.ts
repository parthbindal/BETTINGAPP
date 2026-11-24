/** Pure rules for job claims (job-runs.ts), kept apart from the database so they can be tested. */

/** A failed run may be retried this soon, instead of waiting out the whole gap. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;
/** A run still unfinished after this was killed mid-way (functions stop at 300 s). */
const ABANDONED_AFTER_MS = 6 * 60_000;

/**
 * When a job last started before these times, it may start again: any run
 * after `gap`, a failed run after `retry`, a run killed mid-way after
 * `abandoned`. Never later than `gap`.
 */
export function claimCutoffs(minGapMs: number, now: Date): { gap: Date; retry: Date; abandoned: Date } {
  const at = (ms: number) => new Date(now.getTime() - Math.min(ms, minGapMs));
  return { gap: at(minGapMs), retry: at(RETRY_AFTER_FAILURE_MS), abandoned: at(ABANDONED_AFTER_MS) };
}
