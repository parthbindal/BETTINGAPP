import { test } from "node:test";
import assert from "node:assert/strict";
import { boardSignature, indexByWallet, liveTop, rankMoves, withLive } from "../src/lib/live-board";
import { leaderboardUrl, parseLeaderboard, type LeaderEntry } from "../src/lib/data/providers/polymarket-whales";

const entry = (wallet: string, rank: number, pnl: number, name = wallet): LeaderEntry => ({ wallet, rank, pnl, name, volume: 0, xUsername: null, verified: false });
const row = (wallet: string, rank: number, pnl: number, positions = 1) => ({ wallet, name: wallet, rank, pnl, positions });

test("parseLeaderboard reads both response shapes and drops malformed rows", () => {
  const raw = [
    { rank: 1, user_id: "0xAbC0000000000000000000000000000000000001", user_name: "Theo4", pnl: 22053933.75, volume: 4.3e7 },
    { rank: 2, user_id: "0x2", user_name: "0x2deadbeef", pnl: "18482390.76", volume: 1 },
    { rank: "x", user_id: "0x3", pnl: 1 },
    { rank: 4, pnl: 1 },
  ];
  const fromObject = parseLeaderboard({ data: raw, pagination: { has_more: true } });
  assert.deepEqual(parseLeaderboard(raw), fromObject);
  assert.equal(fromObject.length, 2);
  assert.equal(fromObject[0]!.name, "Theo4");
  assert.equal(fromObject[1]!.pnl, 18482390.76, "numeric strings are read as numbers");
  assert.equal(fromObject[1]!.name, "0x2…0x2", "0x display names fall back to the short address");
  assert.deepEqual(parseLeaderboard(null), []);
  assert.deepEqual(parseLeaderboard({ error: "rate limited" }), []);
});

test("leaderboardUrl always names the period and clamps the size", () => {
  assert.equal(leaderboardUrl("ALL", 5000), "https://data-api.polymarket.com/v2/leaderboard?timePeriod=ALL&limit=1000");
  assert.equal(leaderboardUrl("DAY", 0), "https://data-api.polymarket.com/v2/leaderboard?timePeriod=DAY&limit=1");
});

test("withLive replaces rank, profit and name only where Polymarket has the wallet", () => {
  const live = indexByWallet([entry("0xA", 2, 900, "alpha"), entry("0xb", 1, 1000)]);
  const rows = [row("0xa", 1, 800), row("0xB", 2, 950), row("0xc", 3, 100)];
  const out = withLive(rows, live);
  assert.deepEqual(
    out.map((r) => [r.wallet, r.rank, r.pnl, r.name]),
    [
      ["0xa", 2, 900, "alpha"],
      ["0xB", 1, 1000, "0xb"],
      ["0xc", 3, 100, "0xc"],
    ],
  );
  assert.equal(out[2], rows[2], "untouched rows keep their identity");
  assert.equal(out[0]!.positions, 1, "scanned columns are kept");
  assert.equal(withLive(rows, null), rows);
});

test("rankMoves counts places since the first live read and leaves unmoved traders out", () => {
  const first = indexByWallet([entry("a", 1, 10), entry("b", 2, 9), entry("c", 3, 8)]);
  const later = indexByWallet([entry("a", 2, 10), entry("b", 1, 12), entry("c", 3, 8), entry("d", 4, 7)]);
  assert.deepEqual([...rankMoves(first, later)], [
    ["a", -1],
    ["b", 1],
  ]);
  assert.equal(rankMoves(null, later).size, 0);
});

test("liveTop orders by live rank, joins scanned rows, and never invents figures for newcomers", () => {
  const scanned = [row("a", 1, 10, 5), row("b", 2, 9, 0), row("c", 3, 8, 2)];
  const live = [entry("c", 1, 30), entry("x", 2, 20), entry("a", 3, 10)];
  const top = liveTop(scanned, live, 3, (e) => ({ wallet: e.wallet, name: e.name, rank: e.rank, pnl: e.pnl, positions: -1 }));
  assert.deepEqual(
    top.map((r) => [r.wallet, r.rank, r.pnl, r.positions]),
    [
      ["c", 1, 30, 2],
      ["x", 2, 20, -1],
      ["a", 3, 10, 5],
    ],
  );
  // Before the first live read, the scan's own order.
  assert.deepEqual(
    liveTop([...scanned].reverse(), null, 2, () => scanned[0]!).map((r) => r.wallet),
    ["a", "b"],
  );
});

test("boardSignature changes when any rank or profit does", () => {
  const a = [entry("a", 1, 10), entry("b", 2, 9)];
  assert.equal(boardSignature(a), boardSignature([entry("A", 1, 10), entry("B", 2, 9)]), "wallet case does not matter");
  assert.notEqual(boardSignature(a), boardSignature([entry("a", 1, 10.5), entry("b", 2, 9)]));
  assert.notEqual(boardSignature(a), boardSignature([entry("b", 1, 9), entry("a", 2, 10)]));
});

test("job claims: a healthy run waits out the gap, a failed or killed one retries sooner", async () => {
  const { claimCutoffs } = await import("../src/lib/job-runs-core");
  const now = new Date("2026-11-24T06:00:00Z");
  const min = (d: Date) => (now.getTime() - d.getTime()) / 60_000;
  const scan = claimCutoffs(55 * 60_000, now);
  assert.deepEqual([min(scan.gap), min(scan.retry), min(scan.abandoned)], [55, 5, 6]);
  // A gap shorter than the retry windows is never stretched by them.
  const alerts = claimCutoffs(4 * 60_000, now);
  assert.deepEqual([min(alerts.gap), min(alerts.retry), min(alerts.abandoned)], [4, 4, 4]);
});
