import { test } from "node:test";
import assert from "node:assert/strict";
import { explainSplit, isInPlay, isOverdueGame, polymarketMarketUrl, splitSides } from "../src/lib/intel";

test("explainSplit says when money agrees with the trader count", () => {
  assert.equal(
    explainSplit({ outcome: "Knicks", holders: 38, totalValue: 259_928 }, { outcome: "Trail Blazers", holders: 25, totalValue: 179_016 }),
    "More top traders back Knicks (38 vs 25), and they have more money on it too ($260K vs $179K).",
  );
});

test("explainSplit says when the money disagrees with the trader count", () => {
  assert.equal(
    explainSplit({ outcome: "Yes", holders: 16, totalValue: 47_310 }, { outcome: "No", holders: 13, totalValue: 1_249_772 }),
    "More top traders back Yes (16 vs 13), but more money is on No ($1.2M vs $47K).",
  );
});

test("explainSplit handles an even trader count", () => {
  assert.equal(explainSplit({ outcome: "Over", holders: 11, totalValue: 500 }, { outcome: "Under", holders: 11, totalValue: 500 }), "Top traders are evenly split: 11 on each side.");
  assert.equal(
    explainSplit({ outcome: "Over", holders: 11, totalValue: 500 }, { outcome: "Under", holders: 11, totalValue: 90_000 }),
    "Top traders are evenly split (11 each), but more money is on Under ($90K vs $500).",
  );
});

test("splitSides only returns markets with two qualifying sides, most traders first", () => {
  const rows = [
    { conditionId: "m1", outcome: "A", holders: 12, totalValue: 1 },
    { conditionId: "m1", outcome: "B", holders: 20, totalValue: 1 },
    { conditionId: "m2", outcome: "Yes", holders: 30, totalValue: 1 },
    { conditionId: "m2", outcome: "No", holders: 4, totalValue: 1 },
  ];
  const s = splitSides(rows, 10);
  assert.deepEqual([...s.keys()], ["m1"]);
  assert.deepEqual(
    s.get("m1")!.map((h) => h.outcome),
    ["B", "A"],
  );
});

test("polymarketMarketUrl links the exact polymarket.com market, falling back to the event, then the market path", () => {
  assert.equal(
    polymarketMarketUrl("democratic-presidential-nominee-2028", "will-jon-ossoff-win-the-2028-democratic-presidential-nomination-885"),
    "https://polymarket.com/event/democratic-presidential-nominee-2028/will-jon-ossoff-win-the-2028-democratic-presidential-nomination-885",
  );
  assert.equal(polymarketMarketUrl("nba-mem-min-2026-11-21", null), "https://polymarket.com/event/nba-mem-min-2026-11-21");
  assert.equal(polymarketMarketUrl(null, "some-market"), "https://polymarket.com/market/some-market");
  assert.equal(polymarketMarketUrl(null, null), null);
});


test("isInPlay treats 3¢ and below or 97¢ and above as decided", () => {
  assert.equal(isInPlay({ currentPrice: 0.5 }), true);
  assert.equal(isInPlay({ currentPrice: 0.03 }), false);
  assert.equal(isInPlay({ currentPrice: 0.97 }), false);
  assert.equal(isInPlay({ currentPrice: 0.04 }), true);
});

import { squarify } from "../src/lib/treemap";

test("squarify fills the bounds exactly, proportionally, without overlap", () => {
  const items = [6, 6, 4, 3, 2, 2, 1];
  const out = squarify(items, (v) => v, { x: 0, y: 0, w: 6, h: 4 });
  assert.equal(out.length, items.length);
  const total = items.reduce((s, v) => s + v, 0);
  for (const { item, rect } of out) {
    assert.ok(Math.abs(rect.w * rect.h - (item / total) * 24) < 1e-9, "area proportional to weight");
    assert.ok(rect.x >= -1e-9 && rect.y >= -1e-9 && rect.x + rect.w <= 6 + 1e-9 && rect.y + rect.h <= 4 + 1e-9, "inside bounds");
  }
  for (let a = 0; a < out.length; a++)
    for (let b = a + 1; b < out.length; b++) {
      const A = out[a]!.rect;
      const B = out[b]!.rect;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      assert.ok(ox <= 1e-9 || oy <= 1e-9, "tiles do not overlap");
    }
});

test("squarify drops zero weights and handles empty input", () => {
  assert.deepEqual(squarify([], (v: number) => v, { x: 0, y: 0, w: 1, h: 1 }), []);
  assert.equal(squarify([0, 5, 0], (v) => v, { x: 0, y: 0, w: 2, h: 1 }).length, 1);
});

import { percentileOf, standingLabel } from "../src/lib/intel";

test("percentileOf counts only strictly smaller values and ignores non-finite ones", () => {
  assert.equal(percentileOf([1, 2, 3, 4], 3), 0.5);
  assert.equal(percentileOf([1, 2, 3, 4], 1), 0);
  assert.equal(percentileOf([1, 2, NaN, 4], 5), 1);
  assert.equal(percentileOf([], 5), 0);
});

test("standingLabel never says Top 0%", () => {
  assert.equal(standingLabel(1), "Top 1%");
  assert.equal(standingLabel(0.97), "Top 3%");
  assert.equal(standingLabel(0.5), "Top 50%");
  assert.equal(standingLabel(0.2), "Bottom 20%");
});

import { walletDailyFlow } from "../src/lib/wallet-live";

test("walletDailyFlow keeps a single partial day instead of returning nothing", () => {
  const ts = Date.UTC(2026, 10, 22, 12) / 1000;
  const trades = [0, 60, 120].map((d) => ({ ts: ts + d, side: "BUY" as const, usd: 1000 })) as unknown as Parameters<typeof walletDailyFlow>[0];
  const rows = walletDailyFlow(trades, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.buys, 3000);
  assert.equal(rows[0]!.partial, true);
});

import { legibleTreemap, takeLargest } from "../src/lib/treemap";
import { moneyByMove, moveDirection, moveTier, sinceEntry } from "../src/lib/intel";

test("takeLargest keeps the biggest items down to a minimum share, within a cap", () => {
  const items = [450, 100, 80, 70, 40, 9, 8, 5, 3]; // 9 of 765 is 1.2%, under a 2% floor
  assert.deepEqual(takeLargest(items, (v) => v, { minShare: 0.02, max: 10 }), [450, 100, 80, 70, 40]);
  assert.deepEqual(takeLargest(items, (v) => v, { minShare: 0, max: 3 }), [450, 100, 80]);
  assert.deepEqual(takeLargest(items, (v) => v, { minShare: 0.5, max: 10, min: 3 }), [450, 100, 80], "never fewer than min");
  assert.deepEqual(takeLargest([0, 5, 0, 2], (v) => v, { minShare: 0, max: 10 }), [5, 2], "zero weights dropped");
});

test("legibleTreemap drops the smallest items until no tile is thinner than minSide", () => {
  const items = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const bounds = { x: 0, y: 0, w: 240, h: 100 };
  assert.equal(legibleTreemap(items, (v) => v, bounds, { minSide: 0 }).length, items.length, "minSide 0 keeps everything");
  const out = legibleTreemap(items, (v) => v, bounds, { minSide: 14 });
  assert.ok(out.length >= 3 && out.length < items.length);
  for (const t of out) assert.ok(Math.min(t.rect.w, t.rect.h) >= 14, "every tile wide enough to label");
  assert.deepEqual(
    out.map((t) => t.item),
    items.slice(0, out.length),
    "drops from the small end",
  );
  assert.equal(legibleTreemap([100, 1, 1], (v) => v, { x: 0, y: 0, w: 10, h: 10 }, { minSide: 5 }).length, 3, "never below min");
});

test("price moves: under half a percent is no change, and tiers are named buckets", () => {
  assert.ok(Math.abs(sinceEntry({ avgEntry: 0.5, currentPrice: 0.85 }) - 0.7) < 1e-9);
  assert.equal(sinceEntry({ avgEntry: 0, currentPrice: 0.4 }), 0, "no entry price, no move");
  assert.deepEqual([0.004, -0.004, 0.006, -0.03].map(moveDirection), ["flat", "flat", "up", "down"]);
  assert.deepEqual([0.019, 0.02, 0.079, 0.08, 0.199, 0.2, 0.7, -0.05, -0.25].map(moveTier), [0, 1, 1, 2, 2, 3, 3, 1, 3]);
});

test("moneyByMove weighs by dollars, not by count", () => {
  const m = moneyByMove([
    { avgEntry: 0.5, currentPrice: 0.85, totalValue: 9_000_000 },
    { avgEntry: 0.6, currentPrice: 0.5, totalValue: 1_000_000 },
    { avgEntry: 0.4, currentPrice: 0.401, totalValue: 500_000 }, // +0.25%: no real change
    { avgEntry: 0.3, currentPrice: 0.2, totalValue: 0 },
  ]);
  assert.deepEqual(m, { total: 10_500_000, up: 9_000_000, down: 1_000_000, flat: 500_000 });
});

test("isInPlay keeps political markets open past their placeholder end date", () => {
  // "Next Prime Minister of Israel" was past its listed end date (Oct 28) and still trading at 82c on Nov 25.
  assert.equal(isInPlay({ currentPrice: 0.82, category: "Politics", endDate: "2026-10-28" }), true);
  assert.equal(isInPlay({ currentPrice: 0.82, endDate: "2026-10-28" }), true);
  assert.equal(isInPlay({ currentPrice: 0.995 }), false);
});

test("isOverdueGame: a sports game whose day is 36h+ gone is postponed or awaiting a result, not live", () => {
  // Still open at 51c on Polymarket six weeks after kickoff.
  assert.equal(isOverdueGame({ category: "Sports", endDate: "2026-10-10T12:00:00Z" }), true);
  assert.equal(isInPlay({ currentPrice: 0.51, category: "Sports", endDate: "2026-10-10" }), false);
  // Tonight's and future games stay live; "1970-01-01" means no date; politics never counts.
  assert.equal(isOverdueGame({ category: "Sports", endDate: new Date(Date.now() - 12 * 3_600_000).toISOString() }), false);
  assert.equal(isOverdueGame({ category: "Sports", endDate: "2999-01-01" }), false);
  assert.equal(isOverdueGame({ category: "Sports", endDate: "1970-01-01" }), false);
  assert.equal(isOverdueGame({ category: "Politics", endDate: "2026-10-28" }), false);
  // Safe as a bare .filter() callback (no second parameter for the index to land in).
  assert.deepEqual([{ currentPrice: 0.51, category: "Sports", endDate: "2026-10-10" }].filter(isInPlay), []);
});

test("closedMarketCandidates asks Polymarket only about markets that could have closed", async () => {
  const { closedMarketCandidates } = await import("../src/lib/data/providers/polymarket-whales");
  const now = Date.parse("2026-11-25T08:00:00Z");
  const ids = closedMarketCandidates(
    [
      { conditionId: "game-last-night", endDate: "2026-11-24" },
      { conditionId: "game-tomorrow", endDate: "2026-11-26" },
      { conditionId: "stale-end-date", endDate: "2026-10-28T03:59:00Z" },
      { conditionId: "no-date", endDate: "1970-01-01" },
      { conditionId: "missing", endDate: null },
      { conditionId: "far-future", endDate: "2028-11-07" },
      { conditionId: "game-last-night", endDate: "2026-11-24" },
    ],
    now,
  );
  assert.deepEqual(ids.sort(), ["game-last-night", "game-tomorrow", "stale-end-date"]);
});

test("holderPairsFrom counts live bets two traders share, biggest overlap first", async () => {
  const { holderPairsFrom } = await import("../src/lib/intel");
  const live = (title: string, ranks: number[]) => ({ title, outcome: "Yes", ranks, currentPrice: 0.5, category: "Politics", endDate: null });
  const pairs = holderPairsFrom(
    [
      live("A", [1, 2, 3]),
      live("B", [2, 1]),
      live("C", [1, 2, 9]),
      live("D", [3, 9]),
      // Decided at 99c: two traders sitting on a near-certainty says nothing about shared judgement.
      { title: "E", outcome: "No", ranks: [1, 2], currentPrice: 0.99, category: "Politics", endDate: null },
      // Unknown rank (0) never pairs.
      live("F", [0, 1]),
    ],
    { min: 2 },
  );
  // #1 and #2 share A, B and C (3). Every other pair shares one live bet, under min 2. E (99c) and F (rank 0) add nothing.
  assert.deepEqual(pairs.map((p) => [p.aRank, p.bRank, p.shared]), [[1, 2, 3]]);
  assert.deepEqual(pairs[0]!.markets.map((m) => m.title), ["A", "B", "C"]);
  assert.equal(holderPairsFrom([live("A", [1, 2, 3])], { min: 1 }).length, 3, "three holders make three pairs");
});
