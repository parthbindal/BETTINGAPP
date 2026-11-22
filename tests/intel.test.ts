import { test } from "node:test";
import assert from "node:assert/strict";
import { isInPlay, polymarketMarketUrl } from "../src/lib/intel";

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
