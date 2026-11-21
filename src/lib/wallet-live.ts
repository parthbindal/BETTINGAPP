import { cacheLife } from "next/cache";
import { fetchPositions, fetchRecentTrades, type RawPosition, type RawTrade } from "@/lib/data/providers/polymarket-whales";

export const WALLET_TRADES_LIMIT = 100;

export interface WalletLive {
  positions: RawPosition[];
  trades: RawTrade[];
  fetchedAt: string;
}

/**
 * A wallet's open positions ($100+) and its latest trades, read live from
 * Polymarket and cached for a few minutes so repeat views do not re-hit the
 * API. Throws when Polymarket is unreachable; callers show an error state.
 */
export async function getWalletLive(address: string): Promise<WalletLive> {
  "use cache";
  cacheLife("minutes");
  const [positions, trades] = await Promise.all([fetchPositions(address, 300), fetchRecentTrades(address, WALLET_TRADES_LIMIT)]);
  return { positions, trades, fetchedAt: new Date().toISOString() };
}

/**
 * Daily buy and sell volume from a wallet's fetched trades. When the fetch hit
 * its limit, the oldest day may be partial, so it is dropped rather than shown
 * as a quiet day.
 */
export function walletDailyFlow(trades: RawTrade[], limitHit: boolean, maxDays = 14): Array<{ day: string; buys: number; sells: number; trades: number }> {
  if (!trades.length) return [];
  const byDay = new Map<string, { buys: number; sells: number; trades: number }>();
  const newest = Math.max(...trades.map((t) => t.ts)) * 1000;
  const oldest = Math.min(...trades.map((t) => t.ts)) * 1000;
  const end = new Date(newest);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(Math.max(oldest, end.getTime() - (maxDays - 1) * 86_400_000));
  start.setUTCHours(0, 0, 0, 0);
  if (limitHit) start.setTime(start.getTime() + 86_400_000);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) byDay.set(new Date(t).toISOString().slice(0, 10), { buys: 0, sells: 0, trades: 0 });
  for (const t of trades) {
    const b = byDay.get(new Date(t.ts * 1000).toISOString().slice(0, 10));
    if (!b) continue;
    b.trades++;
    if (t.side === "BUY") b.buys += t.usd;
    else b.sells += t.usd;
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
}
