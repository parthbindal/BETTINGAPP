import { after } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { logError } from "@/lib/ops";
import { isBuildPhase, runClaimed } from "@/lib/job-runs";
import { fetchBigTrades, type RawTrade } from "@/lib/data/providers/polymarket-whales";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { getWhaleWatch } from "@/lib/whales";
import { ACTIVE_STATUSES, PLANS, effectiveTier, type Tier } from "@/lib/subscriptions/plans";
import { sendTelegram, unlinkTelegram } from "@/lib/telegram";
import {
  CHANNEL_DELAY_MS,
  CHANNEL_MAX_PER_HOUR,
  CHANNEL_MIN_USD,
  DEFAULT_ALERT_PREFS,
  FEED_FLOOR_USD,
  FOLLOW_MIN_USD,
  FRESH_MS,
  alertCopy,
  alertHref,
  alertReason,
  burstKey,
  groupBursts,
  isNoise,
  mergeFills,
  summarize,
  telegramHtml,
  type AlertPrefs,
  type AlertView,
  type Fill,
  type SignalContext,
} from "@/lib/smart-alerts-core";

/**
 * Smart-money alerts, the engine. One run:
 *  1. reads the newest $5K+ trades across all of Polymarket (one call) plus
 *     the $1K+ trades of every trader a member follows,
 *  2. keeps the tracked top 1,000 and followed traders, drops noise, groups
 *     fills into bursts and upserts them (SmartAlert.key is deterministic),
 *  3. tells each Pro member whose settings match, in the app and on Telegram
 *     (SmartAlertDelivery is unique per alert, member and channel, so
 *     overlapping runs never notify anyone twice),
 *  4. posts the biggest moves to the free public channel an hour later.
 * Runs every 20 minutes from an outside scheduler (cron-job.org; Neon Free
 * sets that pace, see README), and after page views (keepAlertsFlowing) only
 * if the scheduler goes quiet.
 */

const FOLLOWED_WALLETS_PER_RUN = 100;
/** Traders whose smaller fills are fetched to complete a burst the $5K+ feed only saw part of. */
const COMPLETE_WALLETS_PER_RUN = 25;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** Members whose plan includes smart-money alerts right now (admin overrides of `<tier>.smartAlerts` respected). */
async function alertMembers(now: number): Promise<string[]> {
  const [subs, overrides] = await Promise.all([
    db.subscription.findMany({ where: { tier: { not: "free" }, status: { in: [...ACTIVE_STATUSES] } }, select: { userId: true, tier: true, status: true, source: true, currentPeriodEnd: true } }),
    db.featureLimitOverride.findMany({ where: { key: { endsWith: ".smartAlerts" } } }),
  ]);
  const allowed = (tier: Tier) => {
    const o = overrides.find((x) => x.key === `${tier}.smartAlerts`);
    return o ? o.value === true : PLANS[tier].limits.smartAlerts;
  };
  return subs.filter((s) => allowed(effectiveTier(s, now))).map((s) => s.userId);
}

function toView(a: { wallet: string; traderName: string; rank: number | null; side: string; outcome: string; title: string; tokenId: string; eventSlug: string | null; marketSlug: string | null; usd: number; avgPrice: number; fills: unknown; lastTradeAt: Date }): AlertView {
  return { ...a, fills: Array.isArray(a.fills) ? a.fills.length : 1 };
}

export interface SmartAlertsResult {
  skipped?: string;
  read: number;
  relevant: number;
  bursts: number;
  created: number;
  inApp: number;
  telegram: number;
  channel: number;
  sample?: Array<{ title: string; body: string }>;
}

export async function runSmartAlerts(opts: { now?: number; dryRun?: boolean } = {}): Promise<SmartAlertsResult> {
  const now = opts.now ?? Date.now();
  const result: SmartAlertsResult = { read: 0, relevant: 0, bursts: 0, created: 0, inApp: 0, telegram: 0, channel: 0 };
  const whale = await getWhaleWatch();
  if (!whale) return { ...result, skipped: "no scan yet" };

  const tracked = new Map((whale.payload.wallets ?? []).map((w) => [w.wallet.toLowerCase(), w]));
  const signals = new Map<string, SignalContext>(whale.payload.holdings.filter((h) => h.holders >= CONSENSUS_MIN_WALLETS).map((h) => [h.tokenId, { holders: h.holders }]));

  const followRows = await db.watchlistItem.findMany({ where: { kind: "wallet" }, select: { userId: true, refId: true, label: true } });
  const followers = new Map<string, Set<string>>();
  const followLabel = new Map<string, string>();
  for (const f of followRows) {
    const w = f.refId.toLowerCase();
    if (!followers.has(w)) followers.set(w, new Set());
    followers.get(w)!.add(f.userId);
    followLabel.set(w, f.label);
  }

  // Read from just before the newest burst already stored (late fills join it), never further back than FRESH_MS.
  const latest = await db.smartAlert.findFirst({ orderBy: { lastTradeAt: "desc" }, select: { lastTradeAt: true } });
  const sinceSec = Math.floor(Math.max(now - FRESH_MS, latest ? latest.lastTradeAt.getTime() - 10 * 60_000 : now - 30 * 60_000) / 1000);

  const followed = [...followers.keys()].slice(0, FOLLOWED_WALLETS_PER_RUN);
  const [big, small] = await Promise.all([
    fetchBigTrades(FEED_FLOOR_USD),
    pool(followed, 6, (w) => fetchBigTrades(FOLLOW_MIN_USD, { wallet: w, limit: 200 }).catch(() => [] as RawTrade[])),
  ]);
  const trades = [...big, ...small.flat()];
  result.read = trades.length;
  const firstPass = trades.filter((t) => {
    const w = t.wallet.toLowerCase();
    return t.ts >= sinceSec && (tracked.has(w) || followers.has(w)) && !isNoise(t);
  });
  // The feed only sees fills of $5K+; a big order also leaves smaller fills. Fetch those for every
  // tracked trader seen, but keep only fills that join a burst already found: small trades alone never alert.
  const keys = new Set(firstPass.map((t) => burstKey(t)));
  const toComplete = [...new Set(firstPass.map((t) => t.wallet.toLowerCase()))].filter((w) => !followers.has(w)).slice(0, COMPLETE_WALLETS_PER_RUN);
  const extra = (await pool(toComplete, 4, (w) => fetchBigTrades(500, { wallet: w, limit: 100 }).catch(() => [] as RawTrade[])))
    .flat()
    .filter((t) => t.ts >= sinceSec && !isNoise(t) && keys.has(burstKey(t)));
  const relevant = [...firstPass, ...extra];
  result.relevant = relevant.length;
  const bursts = groupBursts(relevant, (w) => tracked.get(w)?.name ?? followLabel.get(w));
  result.bursts = bursts.length;
  if (!bursts.length) {
    // Nothing new this run, but alerts from an hour ago may be due on the public channel.
    if (!opts.dryRun) result.channel = await postDelayedToChannel(now, signals);
    return result;
  }

  // Upsert: merge with fills stored by earlier runs, then recompute the totals.
  const existing = new Map((await db.smartAlert.findMany({ where: { key: { in: bursts.map((b) => b.key) } } })).map((a) => [a.key, a]));
  const touched: Array<{ id: string; view: AlertView; wallet: string; created: boolean }> = [];
  for (const b of bursts) {
    const prev = existing.get(b.key);
    const fills = mergeFills((prev?.fills as Fill[] | undefined) ?? [], b.fills);
    const s = summarize(fills);
    const data = {
      wallet: b.wallet,
      traderName: b.name,
      rank: tracked.get(b.wallet)?.rank ?? null,
      side: b.side,
      outcome: b.outcome,
      title: b.title,
      tokenId: b.tokenId,
      conditionId: b.conditionId,
      eventSlug: b.eventSlug || null,
      marketSlug: b.marketSlug,
      category: b.category,
      usd: s.usd,
      avgPrice: s.avgPrice,
      fills: fills as unknown as object,
      firstTradeAt: new Date(s.firstTs * 1000),
      lastTradeAt: new Date(s.lastTs * 1000),
    };
    if (opts.dryRun) {
      touched.push({ id: prev?.id ?? b.key, view: toView(data), wallet: b.wallet, created: !prev });
      continue;
    }
    const row = await db.smartAlert.upsert({ where: { key: b.key }, create: { key: b.key, ...data }, update: data });
    touched.push({ id: row.id, view: toView(row), wallet: b.wallet, created: !prev });
  }
  result.created = touched.filter((t) => t.created).length;

  // Fan out to members whose settings match.
  const members = await alertMembers(now);
  const prefsRows = members.length ? await db.notificationPreference.findMany({ where: { userId: { in: members } } }) : [];
  const prefsOf = new Map(prefsRows.map((p) => [p.userId, p]));
  // Re-reads overlap on purpose (late fills), so most pairs were delivered by an earlier run: skip those
  // up front, and let the unique index settle any race with a concurrent run.
  const delivered = opts.dryRun
    ? new Set<string>()
    : new Set((await db.smartAlertDelivery.findMany({ where: { alertId: { in: touched.map((t) => t.id) } }, select: { alertId: true, userId: true, channel: true } })).map((d) => `${d.alertId}|${d.userId}|${d.channel}`));
  const claim = async (alertId: string, userId: string, channel: "inapp" | "telegram") => {
    if (delivered.has(`${alertId}|${userId}|${channel}`)) return false;
    try {
      await db.smartAlertDelivery.create({ data: { alertId, userId, channel } });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  };
  const sample: Array<{ title: string; body: string }> = [];
  for (const t of touched) {
    if (t.view.lastTradeAt.getTime() < now - FRESH_MS) continue;
    const signal = signals.get(t.view.tokenId) ?? null;
    const copy = alertCopy(t.view, signal);
    if (opts.dryRun) {
      if (sample.length < 8) sample.push(copy);
      continue;
    }
    for (const userId of members) {
      const p = prefsOf.get(userId);
      const prefs: AlertPrefs = p ? { smartAlerts: p.smartAlerts, smartMinUsd: p.smartMinUsd, smartMaxRank: p.smartMaxRank, followAlerts: p.followAlerts } : DEFAULT_ALERT_PREFS;
      const reason = alertReason(prefs, t.view, followers.get(t.wallet)?.has(userId) ?? false);
      if (!reason) continue;
      if (await claim(t.id, userId, "inapp")) {
        await db.notification.create({ data: { userId, type: "smart_money", title: copy.title, body: copy.body, href: alertHref(t.view, signal) } });
        result.inApp++;
      }
      if (config.isTelegramConfigured && p?.telegramChatId && (await claim(t.id, userId, "telegram"))) {
        const sent = await sendTelegram(p.telegramChatId, telegramHtml(t.view, { appUrl: config.appUrl, signal, reason }));
        if (sent === "sent") result.telegram++;
        if (sent === "blocked") await unlinkTelegram({ userId });
      }
    }
  }
  if (opts.dryRun) {
    result.sample = sample;
    return result;
  }

  result.channel = await postDelayedToChannel(now, signals);
  return result;
}

/**
 * The free public channel: the biggest moves by the tracked 1,000, an hour
 * after Pro members got them, a few an hour at most. Each alert is claimed
 * (channelPostedAt) before it is sent, so overlapping runs post it once.
 */
async function postDelayedToChannel(now: number, signals: Map<string, SignalContext>): Promise<number> {
  if (!config.isTelegramChannelConfigured) return 0;
  const postedLastHour = await db.smartAlert.count({ where: { channelPostedAt: { gte: new Date(now - 60 * 60_000) } } });
  const room = Math.max(0, CHANNEL_MAX_PER_HOUR - postedLastHour);
  if (!room) return 0;
  const due = await db.smartAlert.findMany({
    where: { channelPostedAt: null, rank: { not: null }, usd: { gte: CHANNEL_MIN_USD }, createdAt: { lte: new Date(now - CHANNEL_DELAY_MS), gte: new Date(now - 6 * 60 * 60_000) } },
    orderBy: { usd: "desc" },
    take: room,
  });
  let posted = 0;
  for (const a of due) {
    const won = await db.smartAlert.updateMany({ where: { id: a.id, channelPostedAt: null }, data: { channelPostedAt: new Date(now) } });
    if (won.count !== 1) continue;
    const html = telegramHtml(toView(a), { appUrl: config.appUrl, signal: signals.get(a.tokenId) ?? null, delayed: { sinceMs: now - a.createdAt.getTime() } });
    if ((await sendTelegram(config.telegramChannelId, html)) === "sent") posted++;
  }
  return posted;
}

const ALERTS_JOB = "smart-alerts";
/** The scheduler calls every 20 minutes. This gap only absorbs accidental repeat calls, across every instance. */
export const ALERTS_MIN_GAP_MS = 4 * 60_000;
/** Page views run alerts only once the scheduler has been quiet this long. */
const ALERTS_FALLBACK_GAP_MS = 25 * 60_000;

/** One alerts run, unless any server instance started one within `minGapMs`. */
export function runSmartAlertsIfDue(minGapMs: number = ALERTS_MIN_GAP_MS) {
  return runClaimed(ALERTS_JOB, minGapMs, () => runSmartAlerts(), (r) => `${r.bursts} bursts, ${r.created} new, ${r.inApp} in-app, ${r.telegram} Telegram`);
}

let lastKick = 0;

/**
 * A fallback for the scheduler. After a page view, run the engine in the
 * background only if no instance has run it for ALERTS_FALLBACK_GAP_MS. While
 * the scheduler is healthy the claim fails here, so page views add no runs:
 * each run costs about 0.8 s of CPU, and running one every 90 seconds per
 * instance under steady traffic would have used up Vercel Hobby's 4 CPU-hours
 * a month on its own.
 */
export function keepAlertsFlowing(): void {
  if (isBuildPhase()) return;
  const now = Date.now();
  if (now - lastKick < 5 * 60_000) return;
  lastKick = now;
  after(async () => {
    try {
      await runSmartAlertsIfDue(ALERTS_FALLBACK_GAP_MS);
    } catch (e) {
      await logError("alerts.background", e);
    }
  });
}
