import { test } from "node:test";
import assert from "node:assert/strict";
import { explainSplit, isInPlay, polymarketMarketUrl, splitSides } from "../src/lib/intel";

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

test("polymarketMarketUrl lands on the exact question when both slugs exist", () => {
  assert.equal(
    polymarketMarketUrl("democratic-presidential-nominee-2028", "will-jon-ossoff-win-the-2028-democratic-presidential-nomination-885"),
    "https://polymarket.com/event/democratic-presidential-nominee-2028/will-jon-ossoff-win-the-2028-democratic-presidential-nomination-885",
  );
});

test("polymarketMarketUrl falls back to the event page for old snapshots", () => {
  assert.equal(polymarketMarketUrl("nba-mem-min-2026-11-21", undefined), "https://polymarket.com/event/nba-mem-min-2026-11-21");
  assert.equal(polymarketMarketUrl("nba-mem-min-2026-11-21", null), "https://polymarket.com/event/nba-mem-min-2026-11-21");
});

test("polymarketMarketUrl uses the market path when only the market slug exists, and null when neither does", () => {
  assert.equal(polymarketMarketUrl(null, "some-market"), "https://polymarket.com/market/some-market");
  assert.equal(polymarketMarketUrl(null, null), null);
});

test("isInPlay treats 3¢ and below or 97¢ and above as decided", () => {
  assert.equal(isInPlay({ currentPrice: 0.5 }), true);
  assert.equal(isInPlay({ currentPrice: 0.03 }), false);
  assert.equal(isInPlay({ currentPrice: 0.97 }), false);
  assert.equal(isInPlay({ currentPrice: 0.04 }), true);
});
