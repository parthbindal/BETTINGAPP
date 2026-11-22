/**
 * Admissibility: whether a consensus may enter the signal ledger at all.
 *
 * This lives apart from lib/signals.ts for one reason. Everything else in that
 * module talks to Postgres, so importing it builds a Prisma client as a side
 * effect and a unit test of this predicate dies on connection config before it
 * reaches its first assertion. The rule below is pure, it is the rule most
 * worth testing, and the only type it needs arrives through `import type`,
 * which TypeScript erases -- so this file pulls in nothing at runtime.
 *
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
import type { ConsensusHolding } from "@/lib/whales";

export const MIN_ENTRY_PRICE = 0.02;
export const MAX_ENTRY_PRICE = 0.98;

export function admissible(h: ConsensusHolding, now: number): boolean {
  if (!(h.currentPrice > MIN_ENTRY_PRICE && h.currentPrice < MAX_ENTRY_PRICE)) return false;
  if (h.endDate) {
    const end = Date.parse(h.endDate);
    if (Number.isFinite(end) && end <= now) return false;
  }
  return true;
}
