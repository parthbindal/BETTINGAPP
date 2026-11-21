import { db } from "@/lib/db";
import { getMarketsByTickers, refreshHotMarkets } from "@/lib/data/markets";
import { impliedProbability } from "@/lib/data/types";
import type { Prisma } from "@/generated/prisma/client";

export type WatchKind = "market" | "event" | "player" | "team" | "stat" | "topic" | "wallet";

export async function listWatchlist(userId: string) {
  const items = await db.watchlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const marketItems = items.filter((i) => i.kind === "market");
  const markets = await getMarketsByTickers(marketItems.map((i) => i.refId));
  const byTicker = new Map(markets.map((m) => [m.ticker, m]));
  const playerIds = items.filter((i) => i.kind === "player").map((i) => i.refId);
  const players = playerIds.length ? await db.player.findMany({ where: { id: { in: playerIds } }, include: { team: true } }) : [];
  const byPlayer = new Map(players.map((p) => [p.id, p]));
  return items.map((i) => {
    const m = i.kind === "market" ? byTicker.get(i.refId) : undefined;
    const current = m ? impliedProbability(m) : null;
    return {
      ...i,
      market: m ?? null,
      player: i.kind === "player" ? byPlayer.get(i.refId) ?? null : null,
      currentValue: current,
      change: current !== null && i.lastValue !== null ? current - i.lastValue : null,
    };
  });
}

export async function addWatchlistItem(userId: string, kind: WatchKind, refId: string, label: string, max: number, meta?: Record<string, unknown>) {
  const count = await db.watchlistItem.count({ where: { userId } });
  const exists = await db.watchlistItem.findUnique({ where: { userId_kind_refId: { userId, kind, refId } } });
  if (exists) return { ok: true as const, item: exists, created: false };
  if (count >= max) return { ok: false as const, reason: `Your plan allows ${max} watchlist items.` };
  let lastValue: number | null = null;
  if (kind === "market") {
    const [m] = await getMarketsByTickers([refId]);
    lastValue = m ? impliedProbability(m) : null;
  }
  const item = await db.watchlistItem.create({ data: { userId, kind, refId, label, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined, lastValue } });
  return { ok: true as const, item, created: true };
}

export async function removeWatchlistItem(userId: string, id: string) {
  await db.watchlistItem.deleteMany({ where: { id, userId } });
}

/** Job: create notifications for market probability moves beyond each user's threshold and upcoming games. */
export async function checkWatchlistAlerts() {
  // Re-quote watched markets first so alerts compare against current prices, not a stale cache.
  await refreshHotMarkets().catch(() => {});
  const items = await db.watchlistItem.findMany({ where: { kind: { in: ["market", "player", "team"] } }, include: { user: { include: { notificationPrefs: true } } } });
  const markets = await getMarketsByTickers([...new Set(items.filter((i) => i.kind === "market").map((i) => i.refId))]);
  const byTicker = new Map(markets.map((m) => [m.ticker, m]));
  let created = 0;
  for (const item of items) {
    const prefs = item.user.notificationPrefs;
    if (item.kind === "market") {
      const m = byTicker.get(item.refId);
      if (!m) continue;
      const current = impliedProbability(m);
      if (current === null) continue;
      const threshold = (prefs?.moveThresholdPts ?? 5) / 100;
      if (item.lastValue !== null && Math.abs(current - item.lastValue) >= threshold && (prefs?.marketMoves ?? true)) {
        const delta = current - item.lastValue;
        await db.notification.create({
          data: {
            userId: item.userId,
            type: "market_move",
            title: `${item.label} moved ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)} pts`,
            body: `Implied probability is now ${(current * 100).toFixed(0)}% (was ${(item.lastValue * 100).toFixed(0)}%). Review the resolution rules and recent news before interpreting the move.`,
            href: `/markets/${item.refId}`,
          },
        });
        created++;
        await db.watchlistItem.update({ where: { id: item.id }, data: { lastValue: current } });
      } else if (item.lastValue === null) {
        await db.watchlistItem.update({ where: { id: item.id }, data: { lastValue: current } });
      }
      if (m.closeTime && prefs?.upcomingEvents !== false) {
        const hours = (new Date(m.closeTime).getTime() - Date.now()) / 3600_000;
        const meta = (item.meta as Record<string, unknown> | null) ?? {};
        if (hours > 0 && hours <= 24 && !meta.closingNotified) {
          await db.notification.create({ data: { userId: item.userId, type: "upcoming_event", title: `${item.label} closes within 24 hours`, body: "Trading stops soon. Final-hours prices often reflect late information.", href: `/markets/${item.refId}` } });
          await db.watchlistItem.update({ where: { id: item.id }, data: { meta: { ...meta, closingNotified: true } as Prisma.InputJsonValue } });
          created++;
        }
      }
    }
    if ((item.kind === "player" || item.kind === "team") && prefs?.upcomingEvents !== false) {
      const where = item.kind === "player" ? { OR: [{ homeTeam: { players: { some: { id: item.refId } } } }, { awayTeam: { players: { some: { id: item.refId } } } }] } : { OR: [{ homeTeamId: item.refId }, { awayTeamId: item.refId }] };
      const game = await db.game.findFirst({ where: { status: "scheduled", startsAt: { gte: new Date(), lte: new Date(Date.now() + 24 * 3600_000) }, ...where }, include: { homeTeam: true, awayTeam: true } });
      const meta = (item.meta as Record<string, unknown> | null) ?? {};
      if (game && meta.lastGameNotified !== game.id) {
        await db.notification.create({ data: { userId: item.userId, type: "upcoming_event", title: `${item.label}: game within 24 hours`, body: `${game.awayTeam.name} at ${game.homeTeam.name}${game.isDemo ? " (demo schedule)" : ""}.`, href: `/sports/games/${game.id}` } });
        await db.watchlistItem.update({ where: { id: item.id }, data: { meta: { ...meta, lastGameNotified: game.id } as Prisma.InputJsonValue } });
        created++;
      }
    }
  }
  return { items: items.length, notifications: created };
}
