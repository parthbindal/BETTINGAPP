import { db } from "@/lib/db";
import { brierScore, logLoss, calibrationBins, skillScore } from "@/lib/analytics/stats";
import * as kalshi from "@/lib/data/providers/kalshi";
import { withProvider, logError } from "@/lib/ops";
import { finalizeDueDemoGames } from "@/lib/demo-sim";
import { awardAchievement } from "@/lib/academy";
import type { Prediction } from "@/generated/prisma/client";

/**
 * Integrity rules for the Performance Tracker:
 *  - A prediction's probability, side and reference prices are fixed at creation.
 *  - It can be deleted only before its lock time (market close / game start).
 *  - Outcomes are never user-entered: markets resolve from the exchange result,
 *    sports from the data provider (simulated and labeled for demo data).
 */
export function isLocked(p: Pick<Prediction, "outcome" | "lockedAt" | "resolutionSource">): boolean {
  return p.outcome !== null || p.resolutionSource !== null || (p.lockedAt !== null && p.lockedAt.getTime() <= Date.now());
}

export interface DomainStats {
  total: number;
  resolved: number;
  pending: number;
  voided: number;
  correct: number;
  accuracy: number | null;
  brier: number | null;
  logLoss: number | null;
  marketBrier: number | null;
  modelBrier: number | null;
  skillVsMarket: number | null;
  skillSample: number;
  calibration: ReturnType<typeof calibrationBins>;
  byCategory: Array<{ category: string; n: number; accuracy: number | null; brier: number | null }>;
  overTime: Array<{ x: string; y: number }>;
}

function statsFor(preds: Prediction[]): DomainStats {
  const resolved = preds.filter((p) => p.outcome !== null);
  const voided = preds.filter((p) => p.outcome === null && p.resolutionSource === "void");
  const f = resolved.map((p) => p.predictedProb);
  const o = resolved.map((p) => Boolean(p.outcome));
  const correct = resolved.filter((p) => p.predictedProb >= 0.5 === Boolean(p.outcome)).length;
  const withMarket = resolved.filter((p) => p.marketProb !== null);
  const withModel = resolved.filter((p) => p.modelProb !== null);
  const marketBrier = withMarket.length ? brierScore(withMarket.map((p) => p.marketProb!), withMarket.map((p) => Boolean(p.outcome))) : null;
  const modelBrier = withModel.length ? brierScore(withModel.map((p) => p.modelProb!), withModel.map((p) => Boolean(p.outcome))) : null;
  const brier = resolved.length ? brierScore(f, o) : null;
  const cats = new Map<string, Prediction[]>();
  for (const p of resolved) {
    const k = p.category ?? "Uncategorized";
    cats.set(k, [...(cats.get(k) ?? []), p]);
  }
  const ordered = [...resolved].sort((a, b) => (a.resolvedAt?.getTime() ?? 0) - (b.resolvedAt?.getTime() ?? 0));
  const overTime: Array<{ x: string; y: number }> = [];
  for (let i = 0; i < ordered.length; i++) {
    const slice = ordered.slice(0, i + 1);
    overTime.push({
      x: `${i + 1}`,
      y: brierScore(
        slice.map((p) => p.predictedProb),
        slice.map((p) => Boolean(p.outcome)),
      ),
    });
  }
  const ownOnMarketSet = withMarket.length ? brierScore(withMarket.map((p) => p.predictedProb), withMarket.map((p) => Boolean(p.outcome))) : null;
  return {
    total: preds.length,
    resolved: resolved.length,
    pending: preds.length - resolved.length - voided.length,
    voided: voided.length,
    correct,
    accuracy: resolved.length ? correct / resolved.length : null,
    brier,
    logLoss: resolved.length ? logLoss(f, o) : null,
    marketBrier,
    modelBrier,
    skillVsMarket: ownOnMarketSet !== null && marketBrier !== null && withMarket.length >= 5 ? skillScore(ownOnMarketSet, marketBrier) : null,
    skillSample: withMarket.length,
    calibration: resolved.length ? calibrationBins(f, o, 10) : [],
    byCategory: [...cats.entries()]
      .map(([category, ps]) => ({
        category,
        n: ps.length,
        accuracy: ps.filter((p) => p.predictedProb >= 0.5 === Boolean(p.outcome)).length / ps.length,
        brier: brierScore(
          ps.map((p) => p.predictedProb),
          ps.map((p) => Boolean(p.outcome)),
        ),
      }))
      .sort((a, b) => b.n - a.n),
    overTime,
  };
}

export async function getTrackerStats(userId: string) {
  const preds = await db.prediction.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return {
    all: statsFor(preds),
    market: statsFor(preds.filter((p) => p.domain === "market")),
    sports: statsFor(preds.filter((p) => p.domain === "sports")),
    predictions: preds,
  };
}

/** Resolve market predictions from the exchange's settlement result. */
export async function resolveMarketPredictions(opts: { userId?: string; maxFetches?: number } = {}) {
  const pending = await db.prediction.findMany({
    where: { domain: "market", outcome: null, resolutionSource: null, ...(opts.userId ? { userId: opts.userId } : {}) },
  });
  if (!pending.length) return { checked: 0, fetched: 0, resolved: 0 };
  const tickers = [...new Set(pending.map((p) => p.refId))];
  const rows = await db.market.findMany({ where: { ticker: { in: tickers } } });
  const byTicker = new Map(rows.map((m) => [m.ticker, m]));
  const now = Date.now();
  let fetched = 0;
  let resolved = 0;
  for (const ticker of tickers) {
    const row = byTicker.get(ticker);
    let result: string | null = row?.result === "yes" || row?.result === "no" ? row.result : null;
    // Only ask the exchange when the market should have closed, or when it has
    // dropped out of the open-market feed (possible early close).
    const closed = row?.closeTime ? row.closeTime.getTime() <= now : false;
    const stale = row ? now - row.fetchedAt.getTime() > 6 * 3600_000 : true;
    if (!result && (closed || stale) && fetched < (opts.maxFetches ?? 25)) {
      fetched++;
      try {
        const m = await withProvider("kalshi", () => kalshi.fetchMarket(ticker, row ? { category: row.category, series_ticker: row.seriesTicker, title: row.title } : undefined));
        await db.market.updateMany({ where: { ticker }, data: { status: m.status, result: m.result, fetchedAt: new Date() } });
        if (m.result === "yes" || m.result === "no") result = m.result;
      } catch (e) {
        await logError("tracker.resolve.market", e, { ticker });
      }
    }
    if (!result) continue;
    for (const p of pending.filter((x) => x.refId === ticker)) {
      const sideYes = (p.side ?? "yes") === "yes";
      await db.prediction.update({ where: { id: p.id }, data: { outcome: sideYes ? result === "yes" : result === "no", resolvedAt: new Date(), resolutionSource: "kalshi" } });
      resolved++;
    }
  }
  return { checked: tickers.length, fetched, resolved };
}

/** Sports refIds are `playerId:stat:line:gameId`. */
export function parseSportsRef(refId: string) {
  const [playerId, stat, line, gameId] = refId.split(":");
  if (!playerId || !stat || !line || !gameId) return null;
  return { playerId, stat, line: Number(line), gameId };
}

/** Resolve sports predictions from final box scores. A player who did not play, or an exact push, voids the prediction. */
export async function resolveSportsPredictions(opts: { userId?: string } = {}) {
  const pending = await db.prediction.findMany({
    where: { domain: "sports", outcome: null, resolutionSource: null, ...(opts.userId ? { userId: opts.userId } : {}) },
  });
  let resolved = 0;
  let voided = 0;
  for (const p of pending) {
    const ref = parseSportsRef(p.refId);
    if (!ref) continue;
    const game = await db.game.findUnique({ where: { id: ref.gameId } });
    if (!game || game.status !== "final") continue;
    const log = await db.playerGameLog.findUnique({ where: { playerId_gameId: { playerId: ref.playerId, gameId: ref.gameId } } });
    const value = log ? (log.stats as Record<string, number>)[ref.stat] : undefined;
    if (value === undefined || value === ref.line) {
      await db.prediction.update({ where: { id: p.id }, data: { resolvedAt: new Date(), resolutionSource: "void" } });
      voided++;
      continue;
    }
    const over = value > ref.line;
    await db.prediction.update({
      where: { id: p.id },
      data: { outcome: (p.side ?? "over") === "over" ? over : !over, resolvedAt: new Date(), resolutionSource: game.isDemo ? "demo" : "provider" },
    });
    resolved++;
  }
  return { checked: pending.length, resolved, voided };
}

/** Lazy, bounded resolution for one user (runs when they open the tracker; cron does the rest). */
export async function resolveDueForUser(userId: string) {
  const pending = await db.prediction.findMany({ where: { userId, outcome: null, resolutionSource: null }, select: { domain: true } });
  if (!pending.length) return;
  try {
    if (pending.some((p) => p.domain === "sports")) {
      await finalizeDueDemoGames(15);
      await resolveSportsPredictions({ userId });
    }
    if (pending.some((p) => p.domain === "market")) await resolveMarketPredictions({ userId, maxFetches: 8 });
    const resolvedCount = await db.prediction.count({ where: { userId, NOT: { outcome: null } } });
    if (resolvedCount >= 10) await awardAchievement(userId, "ten_resolved");
  } catch (e) {
    await logError("tracker.resolveDueForUser", e, { userId });
  }
}
