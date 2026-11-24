/**
 * Background jobs that every server instance can start (the whale scan, the
 * smart-money alerts) claim a shared JobRun row first. Vercel runs several
 * instances side by side, and per-instance timers could not see each other:
 * three full scans once started within thirty seconds.
 *
 * The claim is one conditional UPDATE, so two instances can never both win
 * it. Its gap doubles as a cap on how often a job can run at all, which is
 * what keeps the free tiers' compute budgets safe (see README, "Free-tier
 * budget").
 */
import { db } from "@/lib/db";
import { claimCutoffs } from "@/lib/job-runs-core";

export interface JobRunState {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
}

/**
 * True inside `next build`. `after()` callbacks also run after a build-time
 * prerender, and background jobs started there ran from the build machine
 * against production and failed ("fetch() rejects when the prerender is
 * complete"). Next sets this itself and checks it the same way.
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

const prismaCode = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined);
const isUniqueViolation = (e: unknown) => prismaCode(e) === "P2002";
/** P2021: the JobRun table is not there, i.e. this code is deployed before its migration. */
const isMissingTable = (e: unknown) => prismaCode(e) === "P2021";

let warnedMissing = false;
function warnMissingTable(): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.error("[jobs.claim] The JobRun table is missing; run `npx prisma migrate deploy`. Jobs run unclaimed until then.");
}

/**
 * Start `name` unless any instance started it within `minGapMs`. True means
 * this caller owns the run and must call finishRun afterwards.
 *
 * Fails open when the JobRun table does not exist yet: jobs then run as they
 * did before claims existed (per-instance throttles only), rather than not at
 * all.
 */
export async function claimRun(name: string, minGapMs: number, now = new Date()): Promise<boolean> {
  try {
    return await claim(name, minGapMs, now);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    warnMissingTable();
    return true;
  }
}

async function claim(name: string, minGapMs: number, now: Date): Promise<boolean> {
  const cut = claimCutoffs(minGapMs, now);
  const { count } = await db.jobRun.updateMany({
    where: {
      name,
      OR: [{ startedAt: { lt: cut.gap } }, { ok: false, startedAt: { lt: cut.retry } }, { finishedAt: null, startedAt: { lt: cut.abandoned } }],
    },
    data: { startedAt: now, finishedAt: null, ok: null, note: null },
  });
  if (count) return true;
  try {
    // First run ever: whoever inserts the row owns it.
    await db.jobRun.create({ data: { name, startedAt: now } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

export async function finishRun(name: string, ok: boolean, note?: string): Promise<void> {
  try {
    await db.jobRun.update({ where: { name }, data: { finishedAt: new Date(), ok, note: note ? note.slice(0, 300) : null } });
  } catch {
    /* bookkeeping must never fail the job */
  }
}

export async function getRun(name: string): Promise<JobRunState | null> {
  try {
    return await db.jobRun.findUnique({ where: { name }, select: { startedAt: true, finishedAt: true, ok: true } });
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

/** Run `fn` only if the claim succeeds; record how it ended. */
export async function runClaimed<T>(name: string, minGapMs: number, fn: () => Promise<T>, describe?: (r: T) => string): Promise<{ ran: true; result: T } | { ran: false }> {
  if (!(await claimRun(name, minGapMs))) return { ran: false };
  try {
    const result = await fn();
    await finishRun(name, true, describe?.(result));
    return { ran: true, result };
  } catch (e) {
    await finishRun(name, false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
