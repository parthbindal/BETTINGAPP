import { test } from "node:test";
import assert from "node:assert/strict";
import type { RawTrade } from "../src/lib/data/providers/polymarket-whales";
import {
  BURST_WINDOW_SEC,
  DEFAULT_ALERT_PREFS,
  alertCopy,
  alertReason,
  burstKey,
  groupBursts,
  isNoise,
  parseBotCommand,
  summarize,
  telegramHtml,
  type AlertView,
} from "../src/lib/smart-alerts-core";
import { effectiveTier } from "../src/lib/subscriptions/plans";
import { freePreviewTokens } from "../src/lib/intel";

const T0 = 1_795_000_000 - (1_795_000_000 % BURST_WINDOW_SEC); // start of a burst window
const trade = (over: Partial<RawTrade> = {}): RawTrade => ({
  wallet: "0xABC0000000000000000000000000000000000001",
  ts: T0 + 60,
  side: "BUY",
  outcome: "No",
  title: "Will JD Vance win the 2028 US Presidential Election?",
  usd: 10_000,
  price: 0.5,
  conditionId: "0xc1",
  tokenId: "111",
  eventSlug: "presidential-election-winner-2028",
  marketSlug: "will-jd-vance-win-the-2028-us-presidential-election",
  category: "Politics",
  txHash: "0xtx1",
  ...over,
});

test("isNoise drops near-settled prices and bot-churned up/down markets, keeps real conviction trades", () => {
  assert.equal(isNoise(trade()), false);
  assert.equal(isNoise(trade({ price: 0.99 })), true, "parking money at 99¢");
  assert.equal(isNoise(trade({ price: 0.02 })), true, "dust on a dead outcome");
  assert.equal(isNoise(trade({ marketSlug: "btc-updown-5m-1795471200" })), true);
  assert.equal(isNoise(trade({ marketSlug: "bitcoin-up-or-down-november-23-5pm-et" })), true, "hourly up/down");
  assert.equal(isNoise(trade({ marketSlug: "nba-det-orl-2026-11-23" })), false);
});

test("groupBursts merges one trader's fills on one side into a burst, and never double counts a re-read fill", () => {
  const fills = [trade({ txHash: "0xa", usd: 10_189 }), trade({ txHash: "0xb", usd: 5_610, ts: T0 + 120 }), trade({ txHash: "0xa", usd: 10_189 })];
  const [b, ...rest] = groupBursts(fills, () => "ImJustKen");
  assert.equal(rest.length, 0);
  assert.equal(b!.fills.length, 2, "the repeated fill is counted once");
  assert.equal(b!.name, "ImJustKen");
  assert.equal(b!.wallet, "0xabc0000000000000000000000000000000000001", "wallets are lowercased");
  assert.equal(Math.round(summarize(b!.fills).usd), 15_799);
});

test("groupBursts keeps sides, outcomes and 30-minute windows apart", () => {
  const out = groupBursts([trade(), trade({ side: "SELL", txHash: "0xs" }), trade({ tokenId: "222", txHash: "0xt" }), trade({ ts: T0 + BURST_WINDOW_SEC + 5, txHash: "0xu" })], () => undefined);
  assert.equal(out.length, 4);
  assert.equal(new Set(out.map((b) => b.key)).size, 4);
  assert.equal(burstKey(trade()), burstKey(trade({ ts: T0 + BURST_WINDOW_SEC - 1, txHash: "0xz" })), "same window, same key on every poll");
});

test("summarize reports the volume-weighted price, not the average of fill prices", () => {
  const s = summarize([
    { id: "a", usd: 9_000, price: 0.9, ts: 1 },
    { id: "b", usd: 1_000, price: 0.1, ts: 2 },
  ]);
  assert.equal(s.usd, 10_000);
  assert.ok(Math.abs(s.avgPrice - 10_000 / (10_000 + 10_000)) < 1e-12, "10,000 shares at 0.9 and 10,000 at 0.1 average 50¢");
  assert.deepEqual([s.firstTs, s.lastTs], [1, 2]);
});

test("alertReason: followed traders win, then the size and rank rule; unranked traders only via follows", () => {
  const prefs = DEFAULT_ALERT_PREFS; // $25K+, top 250
  assert.equal(alertReason(prefs, { usd: 30_000, rank: 12 }, false), "smart");
  assert.equal(alertReason(prefs, { usd: 24_999, rank: 12 }, false), null, "under the size floor");
  assert.equal(alertReason(prefs, { usd: 90_000, rank: 251 }, false), null, "outside the chosen ranks");
  assert.equal(alertReason(prefs, { usd: 1_500, rank: 900 }, true), "follow");
  assert.equal(alertReason(prefs, { usd: 900, rank: 900 }, true), null, "follows still need $1K");
  assert.equal(alertReason(prefs, { usd: 5_000, rank: null }, true), "follow");
  assert.equal(alertReason({ ...prefs, followAlerts: false }, { usd: 5_000, rank: null }, true), null);
  assert.equal(alertReason({ ...prefs, smartAlerts: false }, { usd: 500_000, rank: 1 }, false), null);
});

const view = (over: Partial<AlertView> = {}): AlertView => ({
  wallet: "0xabc0000000000000000000000000000000000001",
  traderName: "Theo4",
  rank: 1,
  side: "BUY",
  outcome: "No",
  title: "Will JD Vance win the 2028 US Presidential Election?",
  tokenId: "111",
  eventSlug: "presidential-election-winner-2028",
  marketSlug: "will-jd-vance-win-the-2028-us-presidential-election",
  usd: 48_200,
  avgPrice: 0.52,
  fills: 3,
  lastTradeAt: new Date(0),
  ...over,
});

test("alertCopy says who did what, at what price, and whether it joins a signal", () => {
  const c = alertCopy(view(), { holders: 26 });
  assert.equal(c.title, "Theo4 (#1) bought $48.2K of No");
  assert.equal(c.body, "Will JD Vance win the 2028 US Presidential Election? · at 52¢ · 3 fills · 26 top traders hold No");
  assert.equal(alertCopy(view({ side: "SELL", rank: null, fills: 1, outcome: "" }), null).title, "Theo4 sold $48.2K of a side");
});

test("telegramHtml escapes market text and links to the signal, Polymarket, and (delayed) the upgrade", () => {
  const html = telegramHtml(view({ title: "Will <b>A & B</b> win?" }), { appUrl: "https://edge.example/", signal: { holders: 26 }, reason: "follow", delayed: { sinceMs: 62 * 60_000 } });
  assert.ok(html.includes("Will &lt;b&gt;A &amp; B&lt;/b&gt; win?"), "market titles cannot inject markup");
  assert.ok(html.includes('href="https://edge.example/consensus/111"'));
  assert.ok(html.includes('href="https://polymarket.com/event/presidential-election-winner-2028/will-jd-vance-win-the-2028-us-presidential-election"'));
  assert.ok(html.includes("you follow"));
  assert.ok(html.includes("Pro members got this 1 hour ago"));
  assert.ok(telegramHtml(view(), { appUrl: "https://edge.example", signal: null }).includes('href="https://edge.example/wallets/0xabc0000000000000000000000000000000000001"'), "no signal: link the trader");
});

test("parseBotCommand reads /start tokens and /stop, and ignores everything else", () => {
  assert.deepEqual(parseBotCommand("/start AbC_123-xyz0"), { kind: "start", token: "AbC_123-xyz0" });
  assert.deepEqual(parseBotCommand("/start"), { kind: "start", token: null });
  assert.deepEqual(parseBotCommand("/start@EdgewiseBot AbC_123-xyz0"), { kind: "start", token: "AbC_123-xyz0" });
  assert.deepEqual(parseBotCommand("/stop"), { kind: "stop", token: null });
  assert.equal(parseBotCommand("/start <script>").kind, "other", "tokens are strictly [A-Za-z0-9_-]");
  assert.equal(parseBotCommand("hello").kind, "other");
});

test("effectiveTier: active paid plans count, lapsed and expired complimentary grants do not", () => {
  const sub = { tier: "pro", status: "active", source: "stripe", currentPeriodEnd: null };
  assert.equal(effectiveTier(sub), "pro");
  assert.equal(effectiveTier({ ...sub, status: "past_due" }), "pro", "Stripe's grace period keeps access");
  assert.equal(effectiveTier({ ...sub, status: "canceled" }), "free");
  assert.equal(effectiveTier({ ...sub, source: "complimentary", currentPeriodEnd: new Date(1_000) }, 2_000), "free");
  assert.equal(effectiveTier({ ...sub, source: "complimentary", currentPeriodEnd: new Date(3_000) }, 2_000), "pro");
  assert.equal(effectiveTier(null), "free");
  assert.equal(effectiveTier({ ...sub, tier: "platinum" }), "free");
});

test("freePreviewTokens: the biggest live markets, one per market, both sides when split", () => {
  const h = (tokenId: string, conditionId: string, holders: number, totalValue: number, currentPrice = 0.5) => ({ tokenId, conditionId, holders, totalValue, currentPrice });
  const holdings = [
    h("a-no", "A", 26, 9_000_000),
    h("b-no", "B", 37, 2_000_000),
    h("b-yes", "B", 14, 90_000),
    h("settled", "S", 50, 5_000_000, 0.99),
    h("c", "C", 29, 1_600_000),
    h("d", "D", 12, 1_500_000),
    h("thin", "E", 4, 8_000_000),
  ];
  assert.deepEqual([...freePreviewTokens(holdings, 10)].sort(), ["a-no", "b-no", "b-yes", "c"]);
});
