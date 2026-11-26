/**
 * Smart-money alerts, the pure part: which trades count, how fills group into
 * one alert, who wants which alert, and what the alert says. No database and
 * no network here, so every rule is unit tested (tests/alerts.test.ts); the
 * engine that polls, stores and delivers lives in smart-alerts.ts.
 *
 * Every figure in an alert is a measured on-chain trade. Alerts describe what
 * a trader did; they never tell anyone to do the same.
 */
import type { RawTrade } from "@/lib/data/providers/polymarket-whales";
import { compact } from "@/lib/format";

/** Fills from one trader on one outcome and side within this window are one alert (big orders arrive as many fills). */
export const BURST_WINDOW_SEC = 30 * 60;
/** Smallest trade read from the whole-market feed. */
export const FEED_FLOOR_USD = 5_000;
/** Traders a member follows: every trade at least this big. */
export const FOLLOW_MIN_USD = 1_000;
/** The public channel carries only the biggest moves by the tracked 1,000... */
export const CHANNEL_MIN_USD = 50_000;
/** ...an hour after Pro members got them, and at most this many an hour. */
export const CHANNEL_DELAY_MS = 60 * 60_000;
export const CHANNEL_MAX_PER_HOUR = 4;
/** Never push an alert about a trade older than this (a run after a long gap records them quietly). */
export const FRESH_MS = 3 * 60 * 60_000;

export const MIN_USD_OPTIONS = [10_000, 25_000, 50_000, 100_000] as const;
export const RANK_OPTIONS = [50, 100, 250, 1000] as const;

export interface AlertPrefs {
  smartAlerts: boolean;
  smartMinUsd: number;
  smartMaxRank: number;
  followAlerts: boolean;
}
/** About a dozen alerts a day at launch volumes (measured on 2026-11-23: $25K+ trades by the top 250). */
export const DEFAULT_ALERT_PREFS: AlertPrefs = { smartAlerts: true, smartMinUsd: 25_000, smartMaxRank: 250, followAlerts: true };

export interface Fill {
  id: string;
  usd: number;
  price: number;
  ts: number; // unix seconds
}

export interface Burst {
  key: string;
  wallet: string; // lowercase
  name: string;
  side: "BUY" | "SELL";
  outcome: string;
  title: string;
  tokenId: string;
  conditionId: string;
  eventSlug: string;
  marketSlug: string | null;
  category: string;
  fills: Fill[];
}

/**
 * Trades that say nothing about conviction: prices at the edges (cashing out
 * a decided market, or parking money at 98¢), and the 5-minute and hourly
 * crypto up/down markets that bots churn all day.
 */
export function isNoise(t: Pick<RawTrade, "price" | "marketSlug">): boolean {
  if (!(t.price > 0.03 && t.price < 0.97)) return true;
  const slug = (t.marketSlug ?? "").toLowerCase();
  return slug.includes("updown") || /up-or-down.*\d{1,2}(am|pm)/.test(slug);
}

/** Stable across polls: the same on-chain fill always gets the same id. */
export function fillId(t: Pick<RawTrade, "txHash" | "wallet" | "ts" | "tokenId" | "side" | "usd" | "price">): string {
  return `${t.txHash ?? `${t.wallet.toLowerCase()}@${t.ts}`}:${t.tokenId}:${t.side}:${t.usd.toFixed(2)}:${t.price}`;
}

/** Deterministic, so a re-read of the same trades updates the alert instead of creating a second one. */
export function burstKey(t: Pick<RawTrade, "wallet" | "tokenId" | "side" | "ts">): string {
  return `${t.wallet.toLowerCase()}:${t.tokenId}:${t.side}:${Math.floor(t.ts / BURST_WINDOW_SEC)}`;
}

export function groupBursts(trades: RawTrade[], nameOf: (wallet: string) => string | undefined): Burst[] {
  const by = new Map<string, Burst>();
  for (const t of trades) {
    const wallet = t.wallet.toLowerCase();
    const key = burstKey(t);
    let b = by.get(key);
    if (!b) {
      b = {
        key,
        wallet,
        name: nameOf(wallet) || t.name || `${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
        side: t.side,
        outcome: t.outcome,
        title: t.title,
        tokenId: t.tokenId,
        conditionId: t.conditionId,
        eventSlug: t.eventSlug,
        marketSlug: t.marketSlug,
        category: t.category,
        fills: [],
      };
      by.set(key, b);
    }
    b.fills = mergeFills(b.fills, [{ id: fillId(t), usd: t.usd, price: t.price, ts: t.ts }]);
  }
  return [...by.values()];
}

export function mergeFills(a: Fill[], b: Fill[]): Fill[] {
  const m = new Map(a.map((f) => [f.id, f]));
  for (const f of b) m.set(f.id, f);
  return [...m.values()].sort((x, y) => x.ts - y.ts);
}

/** Dollars, the volume-weighted average price, and the time span of a burst. */
export function summarize(fills: Fill[]): { usd: number; avgPrice: number; firstTs: number; lastTs: number } {
  const usd = fills.reduce((s, f) => s + f.usd, 0);
  const shares = fills.reduce((s, f) => s + (f.price > 0 ? f.usd / f.price : 0), 0);
  return { usd, avgPrice: shares > 0 ? usd / shares : 0, firstTs: Math.min(...fills.map((f) => f.ts)), lastTs: Math.max(...fills.map((f) => f.ts)) };
}

export type AlertReason = "follow" | "smart";

/** Why this member gets this alert, or null. A followed trader's trade wins over the size rule so the alert says "you follow". */
export function alertReason(p: AlertPrefs, a: { usd: number; rank: number | null }, follows: boolean): AlertReason | null {
  if (follows && p.followAlerts && a.usd >= FOLLOW_MIN_USD) return "follow";
  if (p.smartAlerts && a.rank !== null && a.rank <= p.smartMaxRank && a.usd >= p.smartMinUsd) return "smart";
  return null;
}

export interface AlertView {
  wallet: string;
  traderName: string;
  rank: number | null;
  side: string;
  outcome: string;
  title: string;
  tokenId: string;
  eventSlug: string | null;
  marketSlug: string | null;
  usd: number;
  avgPrice: number;
  fills: number;
  lastTradeAt: Date;
}

/** Set when the outcome is also a live signal (many top traders on it). */
export interface SignalContext {
  holders: number;
}

const verb = (side: string) => (side === "SELL" ? "sold" : "bought");
const sideLabel = (outcome: string) => (outcome.trim() ? outcome.trim() : "a side");
const priceCents = (p: number) => `${Math.round(p * 100)}¢`;

/** Where an alert leads inside EDGEWISE: the signal's deep dive when there is one, otherwise the trader. */
export function alertHref(a: Pick<AlertView, "tokenId" | "wallet">, signal: SignalContext | null): string {
  return signal ? `/consensus/${a.tokenId}` : `/wallets/${a.wallet}`;
}

/** In-app notification copy. */
export function alertCopy(a: AlertView, signal: SignalContext | null): { title: string; body: string } {
  const who = a.rank ? `${a.traderName} (#${a.rank})` : a.traderName;
  const parts = [a.title, `at ${priceCents(a.avgPrice)}`];
  if (a.fills > 1) parts.push(`${a.fills} fills`);
  if (signal) parts.push(`${signal.holders} top traders hold ${sideLabel(a.outcome)}`);
  return { title: `${who} ${verb(a.side)} $${compact(a.usd)} of ${sideLabel(a.outcome)}`, body: parts.join(" · ") };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ago(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/**
 * Telegram message (HTML parse mode). `delayed` is the public channel's
 * version: it says plainly that Pro members saw it earlier, which is the
 * whole pitch, and stays honest about timing.
 */
export function telegramHtml(a: AlertView, opts: { appUrl: string; signal: SignalContext | null; reason?: AlertReason | null; delayed?: { sinceMs: number } }): string {
  const app = opts.appUrl.replace(/\/$/, "");
  const head = [`🐋 <b>${escapeHtml(a.traderName)}</b>`];
  if (a.rank) head.push(`#${a.rank} all-time`);
  if (opts.reason === "follow") head.push("you follow");
  const lines = [
    head.join(" · "),
    `<b>${verb(a.side)[0]!.toUpperCase()}${verb(a.side).slice(1)} $${compact(a.usd)}</b> of <b>${escapeHtml(sideLabel(a.outcome))}</b> at ${priceCents(a.avgPrice)}${a.fills > 1 ? ` (${a.fills} fills)` : ""}`,
    escapeHtml(a.title),
  ];
  if (opts.signal) lines.push(`👥 ${opts.signal.holders} top traders hold ${escapeHtml(sideLabel(a.outcome))}`);
  // One link, to EDGEWISE: its page says whether Polymarket US lists this game and links there only if it does.
  // A guessed Polymarket US link here sent members to the wrong market or a missing page about half the time.
  const links = [`<a href="${escapeHtml(`${app}${alertHref(a, opts.signal)}`)}">Open in EDGEWISE</a>`];
  lines.push("", links.join(" · "));
  if (opts.delayed) lines.push(`⏱ Pro members got this ${ago(opts.delayed.sinceMs)} ago. <a href="${escapeHtml(`${app}/pricing`)}">Get these alerts first</a>`);
  return lines.join("\n");
}

/** A bot command from a private chat: /start with an optional link token, /stop, or anything else. */
export function parseBotCommand(text: string): { kind: "start" | "stop" | "other"; token: string | null } {
  const t = text.trim();
  const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{8,64}))?$/.exec(t);
  if (start) return { kind: "start", token: start[1] ?? null };
  if (/^\/stop(?:@\w+)?$/.test(t)) return { kind: "stop", token: null };
  return { kind: "other", token: null };
}
