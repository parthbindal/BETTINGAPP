import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/env";
import { getApiContext } from "@/lib/session";
import { apiError, json } from "@/lib/api";
import { logError } from "@/lib/ops";
import { syncMarkets, refreshHotMarkets } from "@/lib/data/markets";
import { checkWatchlistAlerts } from "@/lib/watchlist";
import { runOnboardingSequence, sendDigestEmails } from "@/lib/email";
import { resolveMarketPredictions, resolveSportsPredictions } from "@/lib/tracker";
import { finalizeDueDemoGames } from "@/lib/demo-sim";
import { generateBrief } from "@/lib/briefs";
import { syncWhaleWatch } from "@/lib/whales";

export const maxDuration = 300;

/** Suggested schedules are listed in README.md (Jobs). */
const JOBS: Record<string, () => Promise<unknown>> = {
  "sync-markets": () => syncMarkets(),
  "refresh-hot": () => refreshHotMarkets(),
  "whale-watch": () => syncWhaleWatch({ topN: 1000 }),
  "watchlist-alerts": () => checkWatchlistAlerts(),
  "onboarding-emails": () => runOnboardingSequence(),
  "resolve-predictions": async () => ({
    markets: await resolveMarketPredictions({ maxFetches: 60 }),
    demoGames: await finalizeDueDemoGames(50),
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

function secretMatches(provided: string | null): boolean {
  if (!config.cronSecret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(config.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authorized by the CRON_SECRET bearer token (schedulers) or an admin session (admin console). */
async function authorize(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (secretMatches(bearer) || secretMatches(req.headers.get("x-cron-secret"))) return true;
  const ctx = await getApiContext();
  return ctx?.user.role === "admin";
}

async function run(req: Request, params: Promise<{ job: string }>) {
  if (!(await authorize(req))) return apiError("Not authorized.", 401);
  const { job } = await params;
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
