"use client";

import { useMemo } from "react";
import type { LeaderEntry } from "@/lib/data/providers/polymarket-whales";
import { useLiveBoard } from "./live-board";
import { HotTradersBoard, type HotPeriod } from "./hot-traders";

/**
 * Polymarket's short-window board, re-read live. The all-time ranks that mark
 * a hot trader as proven come from the live all-time board once it has been
 * read, and from the server's scan until then.
 *
 * (The medal podium and the separate "ranks 4 to 12" list that used to sit
 * here were removed: they repeated the table's first twelve rows in a second
 * and third style, and medals read as a betting app, not an instrument.)
 */
export function LiveHotBoard({ initial, period, ranks }: { initial: LeaderEntry[]; period: HotPeriod; ranks: Record<string, number> }) {
  const live = useLiveBoard();
  const board = live?.board ?? null;
  const allTimeRank = useMemo(() => (board ? new Map([...board].map(([w, r]) => [w, r.rank])) : new Map(Object.entries(ranks))), [board, ranks]);
  return <HotTradersBoard traders={live?.hot ?? initial} period={period} allTimeRank={allTimeRank} hrefFor={(k) => (k === "week" ? "/leaderboard" : `/leaderboard?hot=${k}`)} />;
}
