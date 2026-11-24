import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/env";
import { getApiContext } from "@/lib/session";
import { apiError, json } from "@/lib/api";
import { logError } from "@/lib/ops";
import { syncMarkets, refreshHotMarkets } from "@/lib/data/markets";
import { checkWatchlistAlerts } from "@/lib/watchlist";
import { runOnboardingSequence, sendDigestEmails } from "@/lib/email";
import { resolveMarketPredictions, resolveSportsPredictions } from "@/lib/tracker";
import { generateBrief } from "@/lib/briefs";
import { getScanAgeMs, keepScanFresh, scanIfDue } from "@/lib/whales";
import { scoreSignals } from "@/lib/signals";
import { runSmartAlertsIfDue } from "@/lib/smart-alerts";

export const maxDuration = 300;

/** Suggested schedules are listed in README.md (Jobs). */
const JOBS: Record<string, () => Promise<unknown>> = {
  "sync-markets": () => syncMarkets(),
  "refresh-hot": () => refreshHotMarkets(),
  // Shares the scan's claim with page views and the alerts scheduler, so it never doubles up.
  "whale-watch": async () => {
    const run = await scanIfDue();
    return run.ran ? run.result : { skipped: "a scan already ran within the hour" };
  },
  // Settles ledger rows whose markets have closed. Signals are recorded by
  // whale-watch itself; this only grades them.
  "score-signals": () => scoreSignals(),
  "watchlist-alerts": () => checkWatchlistAlerts(),
  // Big trades by the tracked top traders, delivered in the app and on Telegram, every 20 minutes from
  // cron-job.org (see README). The same tick keeps the whale scan hourly, so the smart-money pages stay
  // fresh with no visitors; the scan runs after the response, so the scheduler is not kept waiting.
  "smart-alerts": async () => {
    const run = await runSmartAlertsIfDue();
    keepScanFresh(await getScanAgeMs());
    return run.ran ? run.result : { skipped: "another run started less than 4 minutes ago" };
  },
  "onboarding-emails": () => runOnboardingSequence(),
  "resolve-predictions": async () => ({
    markets: await resolveMarketPredictions({ maxFetches: 60 }),
    sports: await resolveSportsPredictions(),
  }),
  "daily-brief": async () => {
    const brief = await generateBrief("daily");
    return { headline: brief.headline, digest: await sendDigestEmails("daily") };
  },
  "weekly-brief": async () => {
    const brief = await generateBrief("weekly");
    return { headline: brief.headline, digest: await sendDigestEmails("weekly") };
  },
};

function secretMatches(provided: string | null, expected: string = config.cronSecret): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Jobs an outside scheduler may start with ALERTS_CRON_SECRET. Vercel Hobby
 * cannot run sub-daily crons, so a free external scheduler calls
 * smart-alerts; its secret starts nothing else, so a leak cannot be used to
 * run the heavy jobs and burn the free-tier quotas.
 */
const ALERTS_SECRET_JOBS = new Set(["smart-alerts"]);

/** Authorized by CRON_SECRET (Vercel cron), ALERTS_CRON_SECRET (alerts only), or an admin session (admin console). */
async function authorize(req: Request, job: string): Promise<boolean> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const alt = req.headers.get("x-cron-secret");
  if (secretMatches(bearer) || secretMatches(alt)) return true;
  if (ALERTS_SECRET_JOBS.has(job) && (secretMatches(bearer, config.alertsCronSecret) || secretMatches(alt, config.alertsCronSecret))) return true;
  const ctx = await getApiContext();
  return ctx?.user.role === "admin";
}

/*
 * Each smart-alerts run wakes the database, and Neon Free bills every wake as
 * at least five minutes of compute (100 compute-hours a month). A scheduler
 * set too eagerly would drain that, so runs closer together than
 * ALERTS_MIN_GAP_MS are skipped. The claim lives in the database (job-runs.ts),
 * so it holds across every server instance, not just this one.
 */
async function run(req: Request, params: Promise<{ job: string }>) {
  const { job } = await params;
  if (!(await authorize(req, job))) return apiError("Not authorized.", 401);
  const fn = JOBS[job];
  if (!fn) return apiError(`Unknown job. Available: ${Object.keys(JOBS).join(", ")}`, 404);
  const started = Date.now();
  try {
    const result = await fn();
    return json({ ok: true, job, ms: Date.now() - started, result, message: `${job} finished in ${((Date.now() - started) / 1000).toFixed(1)}s` });
  } catch (e) {
    await logError(`job.${job}`, e);
    return apiError(`Job ${job} failed.`, 500);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  return run(req, params);
}
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  return run(req, params);
}
