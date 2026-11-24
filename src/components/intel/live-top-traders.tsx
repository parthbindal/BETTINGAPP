"use client";

import { useMemo } from "react";
import type { LeaderEntry } from "@/lib/data/providers/polymarket-whales";
import { liveTop } from "@/lib/live-board";
import { useLiveBoard } from "./live-board";
import { Podium } from "./podium";
import { TraderProfitList } from "./trader-profit-list";
import { HotTradersBoard, type HotPeriod } from "./hot-traders";
import type { LeaderRow } from "./leaderboard-table";

/**
 * The leaderboard's top sections, re-ranked live. Order and profit come from
 * Polymarket's board as of the last read; open bets and ROI come from the
 * scanned row for the same wallet. A trader new to the top since the scan has
 * no scanned row, and says so rather than showing zeros.
 */
const unscanned = (e: LeaderEntry): LeaderRow => ({
  wallet: e.wallet,
  name: e.name,
  rank: e.rank,
  pnl: e.pnl,
  openRoi: null,
  openCost: 0,
  positions: 0,
  avgPosition: 0,
  openValue: 0,
  lastActiveMs: null,
  lastActiveLabel: null,
  topCategory: null,
  unscanned: true,
});

export function LivePodium({ rows }: { rows: LeaderRow[] }) {
  const live = useLiveBoard();
  return <Podium top={liveTop(rows, live?.top ?? null, 3, unscanned)} live={live ?? undefined} />;
}

export function LiveRanks({ rows, from = 3, to = 12 }: { rows: LeaderRow[]; from?: number; to?: number }) {
  const live = useLiveBoard();
  const top = liveTop(rows, live?.top ?? null, to, unscanned);
  return <TraderProfitList traders={top.slice(from)} max={top[0]?.pnl} live={live ?? undefined} />;
}

/** `ranks`: all-time ranks for the traders the server rendered, until the live all-time board has been read. */
export function LiveHotBoard({ initial, period, ranks }: { initial: LeaderEntry[]; period: HotPeriod; ranks: Record<string, number> }) {
  const live = useLiveBoard();
  const board = live?.board ?? null;
  const allTimeRank = useMemo(() => (board ? new Map([...board].map(([w, r]) => [w, r.rank])) : new Map(Object.entries(ranks))), [board, ranks]);
  return <HotTradersBoard traders={live?.hot ?? initial} period={period} allTimeRank={allTimeRank} hrefFor={(k) => (k === "week" ? "/leaderboard" : `/leaderboard?hot=${k}`)} />;
}
