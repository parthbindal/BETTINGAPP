/**
 * The signal ledger: a permanent, scored record of every consensus the whale
 * scan has ever called.
 *
 * Why this exists separately from WhaleSnapshot: that table is a render cache,
 * one JSON blob per scan, pruned to the last KEEP_SNAPSHOTS. It can tell you
 * what the top traders hold right now. It can never tell you whether following
 * them worked, because by the time a market resolves the scan that called it
 * has been deleted.
 *
 * This module records a signal the first time it is seen, tracks it while it
 * persists, and scores it against the real settlement price once the market
 * closes. Nothing here is estimated or modelled: the entry price is the price
 * that was on screen when we flagged it, and the settlement is Polymarket's.
 *
 * Honesty rules, enforced in code rather than left to discipline:
 *   1. entryPrice is written once and never updated (see recordSignals).
 *   2. A signal is one row per token for all time, so a long-running consensus
 *      counts once, not once per scan.
 *   3. Markets that settle both sides to 0 are `void`, never `lost`.
 *   4. Hit rate is reported with its denominator, or not at all.
 */
import { db } from "@/lib/db";
import { fetchMarketResolutions } from "@/lib/data/providers/polymarket-whales";
import { readConsensus } from "@/lib/intel";
import { logError } from "@/lib/ops";
import type { ConsensusHolding } from "@/lib/whales";

/** Markets resolve on their own schedule, so re-check a while past endDate too. */
const RESOLUTION_GRACE_MS = 2 * 86_400_000;
/**
 * Row updates run concurrently but NOT in a transaction. Each one is an
 * independent fact ("seen again at this price", "this one settled"), with no
 * invariant spanning rows, and wrapping a few hundred of them in a transaction
 * blows Prisma's 5s interactive limit against a networked Postgres. A partial
 * pass is harmless: the next scan reapplies it.
 */
const WRITE_CONCURRENCY = 10;

async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(fn));
  }
}

export type SignalStatus = "open" | "won" | "lost" | "void";

/**
 * A signal is only admissible if it was called while the market was genuinely
 * undecided. Two ways that fails, both of which quietly inflate the record:
 *
 *  1. The market has already ended. Polymarket positions persist after
 *     settlement until the holder redeems them, so a scan happily reports a
 *     decided position at $1.00 as current conviction. Recording those books
 *     free wins at ~0% return and walks the hit rate toward 100%.
 *  2. The price is already at an extreme. A side trading at 0.99 is not a call,
 *     it is a formality, and it carries no information about whether following
 *     these traders is worth anything.
 *
 * Excluding both is the difference between a track record and a sales pitch.
 */
const MIN_ENTRY_PRICE = 0.02;
const MAX_ENTRY_PRICE = 0.98;

export function admissible(h: ConsensusHolding, now: number): boolean {
  if (!(h.currentPrice > MIN_ENTRY_PRICE && h.currentPrice < MAX_ENTRY_PRICE)) return false;
  if (h.endDate) {
    const end = Date.parse(h.endDate);
    if (Number.isFinite(end) && end <= now) return false;
  }
  return true;
}

/**
 * Upsert the current consensus set into the ledger.
 *
 * New tokens are inserted with their entry fields frozen. Tokens already on the
 * record only have their "still true" fields moved: last seen, last price, the
 * peaks and the scan count. Entry data is deliberately absent from the update.
 */
export async function recordSignals(holdings: ConsensusHolding[]): Promise<{ created: number; updated: number; skipped: number }> {
  if (!holdings.length) return { created: 0, updated: 0, skipped: 0 };

  // One row per token even if the caller passes duplicates.
  const byToken = new Map<string, ConsensusHolding>();
  for (const h of holdings) if (!byToken.has(h.tokenId)) byToken.set(h.tokenId, h);
  const now = Date.now();
  const all = [...byToken.values()];
  const rows = all.filter((h) => admissible(h, now));
  const skipped = all.length - rows.length;
  if (!rows.length) return { created: 0, updated: 0, skipped };

  const known = await db.signal.findMany({
    where: { tokenId: { in: rows.map((h) => h.tokenId) } },
    select: { tokenId: true, peakHolders: true, peakValue: true },
  });
  const knownBy = new Map(known.map((k) => [k.tokenId, k]));

  const fresh = rows.filter((h) => !knownBy.has(h.tokenId));
  let created = 0;
  if (fresh.length) {
    const res = await db.signal.createMany({
      data: fresh.map((h) => ({
        tokenId: h.tokenId,
        conditionId: h.conditionId,
        title: h.title,
        outcome: h.outcome,
        category: h.category,
        eventSlug: h.slug ?? null,
        marketSlug: h.marketSlug ?? null,
        endDate: parseDate(h.endDate),
        entryPrice: h.currentPrice,
        entryHolders: h.holders,
        entryValue: h.totalValue,
        entryKind: readConsensus(h).label,
        lastPrice: h.currentPrice,
        peakHolders: h.holders,
        peakValue: h.totalValue,
      })),
      // A concurrent scan may have inserted the same token already; that is a
      // duplicate observation, not an error.
      skipDuplicates: true,
    });
    created = res.count;
  }

  const seen = rows.filter((h) => knownBy.has(h.tokenId));
  const seenAt = new Date(now);
  await inParallel(seen, WRITE_CONCURRENCY, (h) => {
    const prev = knownBy.get(h.tokenId)!;
    return db.signal.update({
      where: { tokenId: h.tokenId },
      // No entry* field appears here, on purpose.
      data: {
        lastSeenAt: seenAt,
        lastPrice: h.currentPrice,
        peakHolders: Math.max(prev.peakHolders, h.holders),
        peakValue: Math.max(prev.peakValue, h.totalValue),
        scans: { increment: 1 },
      },
    });
  });

  return { created, updated: seen.length, skipped };
}

/**
 * Score every open signal whose market has settled.
 *
 * Only markets past their end date (plus a grace window) are queried, so this
 * stays a small number of API calls however large the ledger grows.
 */
export async function scoreSignals(): Promise<{ checked: number; won: number; lost: number; void: number; stillOpen: number }> {
  const cutoff = new Date(Date.now() + RESOLUTION_GRACE_MS);
  const open = await db.signal.findMany({
    where: { status: "open", OR: [{ endDate: { lte: cutoff } }, { endDate: null }] },
    select: { id: true, tokenId: true, conditionId: true, entryPrice: true },
    orderBy: { endDate: "asc" },
    take: 500,
  });
  if (!open.length) return { checked: 0, won: 0, lost: 0, void: 0, stillOpen: 0 };

  let resolutions: Map<string, { closed: boolean; priceByToken: Record<string, number> }>;
  try {
    resolutions = await fetchMarketResolutions([...new Set(open.map((s) => s.conditionId))]);
  } catch (e) {
    await logError("signals.score", e);
    return { checked: open.length, won: 0, lost: 0, void: 0, stillOpen: open.length };
  }

  const tally = { won: 0, lost: 0, void: 0, stillOpen: 0 };
  const updates: Array<{ id: string; status: SignalStatus; settlePrice: number }> = [];

  for (const s of open) {
    const m = resolutions.get(s.conditionId);
    if (!m?.closed) {
      tally.stillOpen++;
      continue;
    }
    const settle = m.priceByToken[s.tokenId];
    if (settle === undefined) {
      // Closed, but this token is not in the payload -- do not guess.
      tally.stillOpen++;
      continue;
    }
    const sides = Object.values(m.priceByToken);
    // Cancelled/legacy markets pay out nothing on either side. Not a loss.
    const isVoid = sides.length > 0 && sides.every((p) => p <= 0);
    const status: SignalStatus = isVoid ? "void" : settle >= 0.5 ? "won" : "lost";
    tally[status === "won" ? "won" : status === "lost" ? "lost" : "void"]++;
    updates.push({ id: s.id, status, settlePrice: settle });
  }

  const resolvedAt = new Date();
  await inParallel(updates, WRITE_CONCURRENCY, (u) => db.signal.update({ where: { id: u.id }, data: { status: u.status, settlePrice: u.settlePrice, resolvedAt } }));

  return { checked: open.length, ...tally };
}

export interface SignalRecord {
  settled: number; // won + lost; the honest denominator
  won: number;
  lost: number;
  voided: number;
  open: number;
  hitRate: number | null; // null until there is anything to divide by
  avgReturn: number | null; // mean per-signal return at entry price, settled only
}

/** Overall record. `null` rates where the sample is empty, never 0 or 100%. */
export async function getSignalRecord(opts: { kind?: string; category?: string } = {}): Promise<SignalRecord> {
  const where = { ...(opts.kind ? { entryKind: opts.kind } : {}), ...(opts.category ? { category: opts.category } : {}) };
  const [won, lost, voided, open, settled] = await Promise.all([
    db.signal.count({ where: { ...where, status: "won" } }),
    db.signal.count({ where: { ...where, status: "lost" } }),
    db.signal.count({ where: { ...where, status: "void" } }),
    db.signal.count({ where: { ...where, status: "open" } }),
    db.signal.findMany({ where: { ...where, status: { in: ["won", "lost"] } }, select: { entryPrice: true, settlePrice: true } }),
  ]);
  const n = won + lost;
  const returns = settled
    .filter((s) => s.settlePrice !== null && s.entryPrice > 0)
    .map((s) => (s.settlePrice! - s.entryPrice) / s.entryPrice);
  return {
    settled: n,
    won,
    lost,
    voided,
    open,
    hitRate: n > 0 ? won / n : null,
    avgReturn: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
  };
}

/** The record split by signal type, so four different claims are not pooled into one. */
export async function getRecordByKind(): Promise<Array<{ kind: string; record: SignalRecord }>> {
  const kinds = await db.signal.findMany({ distinct: ["entryKind"], select: { entryKind: true } });
  return Promise.all(kinds.map(async (k) => ({ kind: k.entryKind, record: await getSignalRecord({ kind: k.entryKind }) })));
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
