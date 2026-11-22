import { test } from "node:test";
import assert from "node:assert/strict";
import { admissible } from "@/lib/signals";
import type { ConsensusHolding } from "@/lib/whales";

/*
 * These guard the one property that decides whether the public track record is
 * evidence or marketing: a signal may only be recorded if it was called while
 * the market was still genuinely undecided.
 *
 * The failure this exists to prevent is not hypothetical. Polymarket positions
 * persist after settlement until the holder redeems them, so the whale scan
 * reports decided positions at $1.00 as live conviction. Recording those books
 * guaranteed wins at ~0% return; the first run of this ledger against real data
 * produced three of them, all entry=1.000, settle=1, return 0.1%. Left in, they
 * walk the hit rate toward 100% while meaning nothing at all.
 */

const NOW = Date.parse("2026-11-22T12:00:00Z");
const TOMORROW = "2026-11-23T12:00:00Z";
const YESTERDAY = "2026-11-21T12:00:00Z";

function holding(over: Partial<ConsensusHolding> = {}): ConsensusHolding {
  return {
    tokenId: "t1",
    conditionId: "c1",
    title: "Will something happen?",
    outcome: "Yes",
    category: "Other",
    holders: 5,
    pctOfField: 0.005,
    totalValue: 50_000,
    totalShares: 100_000,
    avgEntry: 0.4,
    currentPrice: 0.5,
    unrealizedPnl: 1_000,
    endDate: TOMORROW,
    slug: "something",
    ...over,
  };
}

test("signals: a live market at a mid price is admissible", () => {
  assert.equal(admissible(holding(), NOW), true);
});

test("signals: a settled-but-unredeemed position at $1.00 is rejected", () => {
  // The exact shape of the three bogus wins seen on the first real run.
  assert.equal(admissible(holding({ currentPrice: 1, endDate: YESTERDAY }), NOW), false);
});

test("signals: price extremes are rejected even while the market is open", () => {
  assert.equal(admissible(holding({ currentPrice: 0.99 }), NOW), false);
  assert.equal(admissible(holding({ currentPrice: 0.01 }), NOW), false);
  assert.equal(admissible(holding({ currentPrice: 0.985 }), NOW), false);
});

test("signals: a market whose end date has passed is rejected at any price", () => {
  assert.equal(admissible(holding({ currentPrice: 0.5, endDate: YESTERDAY }), NOW), false);
});

test("signals: the admissible band is open, not inclusive", () => {
  assert.equal(admissible(holding({ currentPrice: 0.98 }), NOW), false);
  assert.equal(admissible(holding({ currentPrice: 0.02 }), NOW), false);
  assert.equal(admissible(holding({ currentPrice: 0.97 }), NOW), true);
  assert.equal(admissible(holding({ currentPrice: 0.03 }), NOW), true);
});

test("signals: a missing or unparseable end date falls back to the price guard", () => {
  assert.equal(admissible(holding({ endDate: null }), NOW), true);
  assert.equal(admissible(holding({ endDate: "not-a-date" }), NOW), true);
  assert.equal(admissible(holding({ endDate: null, currentPrice: 0.995 }), NOW), false);
});
