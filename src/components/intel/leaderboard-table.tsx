"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { TraderIdentity } from "@/components/intel/trader-identity";
import { compact, pct, relative } from "@/lib/format";
import { withLive } from "@/lib/live-board";
import { cn } from "@/lib/utils";
import { useLiveBoard } from "./live-board";
import { RankMove } from "./trader-profit-list";
import { CountUp } from "@/components/motion/count-up";

export interface LeaderRow {
  wallet: string;
  name: string;
  rank: number;
  pnl: number;
  openRoi: number | null;
  openCost: number;
  positions: number;
  avgPosition: number;
  openValue: number;
  lastActiveMs: number | null;
  lastActiveLabel: string | null;
  topCategory: string | null;
  /** New to the top since the last scan; its open bets have not been read. */
  unscanned?: boolean;
}

type SortKey = "rank" | "pnl" | "openRoi" | "positions" | "avgPosition" | "openValue" | "lastActive";

const PRESETS: Array<{ label: string; sort: SortKey; title: string }> = [
  { label: "Highest profit", sort: "pnl", title: "All-time profit on Polymarket's leaderboard" },
  { label: "Highest open ROI", sort: "openRoi", title: "Unrealized return on open positions, among wallets with at least $5,000 deployed" },
  { label: "Most active", sort: "positions", title: "Most open positions right now" },
  { label: "Recently active", sort: "lastActive", title: "Newest trade we can see: on an open bet, or for the top 100, any trade in the last 10 days" },
];
const PAGE_SIZE = 25;
const MIN_ROI_COST = 5_000; // open ROI ranking ignores tiny books, where a few dollars swing the percentage

function value(r: LeaderRow, key: SortKey): number {
  switch (key) {
    case "lastActive":
      return r.lastActiveMs ?? Number.NEGATIVE_INFINITY;
    case "openRoi":
      return r.openRoi ?? Number.NEGATIVE_INFINITY;
    default:
      return r[key];
  }
}

function SortHeader({ label, k, sort, dir, onSort, align = "right", sup, className }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right"; sup?: string; className?: string }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-2 font-medium", align === "right" && "text-right", className)}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-[0.12em] hover:text-foreground", active && "text-foreground")}>
        {label}
        {sup && <sup>{sup}</sup>}
        {active ? dir === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

/**
 * The tracked-wallet leaderboard: search, ranking presets, sortable columns and
 * pages. Inside a LiveBoardProvider, rank and all-time profit are Polymarket's
 * live figures; every other column is from the scan.
 */
export function LeaderboardTable({ rows: scanned }: { rows: LeaderRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  // Most all-time leaders hold nothing open at any moment; this narrows the board to traders with something to follow.
  const [holdingOnly, setHoldingOnly] = useState(false);
  const live = useLiveBoard();
  const board = live?.board ?? null;
  const rows = useMemo(() => withLive(scanned, board), [scanned, board]);
  const holdingCount = useMemo(() => rows.filter((x) => x.positions > 0).length, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let r = needle ? rows.filter((x) => x.name.toLowerCase().includes(needle) || x.wallet.toLowerCase().includes(needle)) : rows;
    if (holdingOnly) r = r.filter((x) => x.positions > 0);
    if (sort === "openRoi") r = r.filter((x) => x.openRoi !== null && x.openCost >= MIN_ROI_COST);
    return [...r].sort((a, b) => (dir === "asc" ? value(a, sort) - value(b, sort) : value(b, sort) - value(a, sort)));
  }, [rows, query, sort, dir, holdingOnly]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const onSort = (k: SortKey) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir(k === "rank" ? "asc" : "desc");
    }
    setPage(0);
  };
  const applyPreset = (k: SortKey) => {
    setSort(k);
    setDir("desc");
    setPage(0);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ranking">
          {PRESETS.map((p) => (
            <button
              key={p.sort}
              type="button"
              title={p.title}
              aria-pressed={sort === p.sort}
              onClick={() => applyPreset(p.sort)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sort === p.sort ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:border-border hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={holdingOnly}
            onClick={() => {
              setHoldingOnly(!holdingOnly);
              setPage(0);
            }}
            title="Only traders holding at least one open bet of $100 or more in the last scan"
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              holdingOnly ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            With open bets <span className="tabular text-muted-foreground">{holdingCount.toLocaleString("en-US")}</span>
          </button>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search traders by name or wallet</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="leaderboard-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search name or 0x address"
            className="h-9 w-full rounded-lg border border-input bg-surface-1 pl-8 pr-3 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
      </div>

      {/* `relative` matters: without it the sr-only labels in the header (position: absolute) escape this
          scroll box's clipping and widen the whole page on a phone (882px in a 375px viewport). */}
      <div className="scrollbar-thin relative mt-4 min-w-0 overflow-x-auto rounded-xl border border-border">
        {/* Phones get rank, trader and profit; the scan columns join from sm up, where the box scrolls sideways if it must. */}
        <table className="w-full text-sm sm:min-w-[900px]">
          <thead className="bg-surface-1">
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <SortHeader label="#" k="rank" sort={sort} dir={dir} onSort={onSort} align="left" />
              <th scope="col" className="px-2 py-2 font-medium uppercase tracking-[0.12em]">Trader</th>
              <SortHeader label="All-time profit" k="pnl" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Open ROI" k="openRoi" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
              <SortHeader label="Positions" k="positions" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
              <SortHeader label="Avg position" k="avgPosition" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
              <SortHeader label="Exposure" k="openValue" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
              <SortHeader label="Last active" k="lastActive" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
              {/* Phones open a trader from their name; the separate link column only fits from sm up. */}
              <th scope="col" className="hidden px-2 py-2 sm:table-cell"><span className="sr-only">Open profile</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const w = r.wallet.toLowerCase();
              // The server's label until live data arrives (so hydration matches), then kept current.
              const lastActive = live?.checkedAt && r.lastActiveMs ? relative(new Date(r.lastActiveMs)) : r.lastActiveLabel;
              return (
              <tr key={r.wallet} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/40">
                <td className="px-2 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular font-mono text-xs text-muted-foreground">{r.rank}</span>
                    <RankMove places={live?.moved.get(w)} />
                  </span>
                </td>
                <td className="max-w-[160px] px-2 py-2.5 sm:max-w-[260px]">
                  <TraderIdentity wallet={r.wallet} name={r.name} size={26} />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <CountUp value={r.pnl} format="usd" intro={false} animate={!live?.quiet} className="tabular font-medium" />
                </td>
                {r.positions > 0 ? (
                  <>
                    {/* Signed, never colored: an open return is direction, not a result. */}
                    <td className={cn("tabular hidden px-2 py-2.5 text-right sm:table-cell", r.openRoi === null && "text-muted-foreground")}>
                      {r.openRoi === null ? "—" : `${r.openRoi >= 0 ? "+" : "−"}${pct(Math.abs(r.openRoi), 1)}`}
                    </td>
                    <td className="tabular hidden px-2 py-2.5 text-right sm:table-cell">{r.positions}</td>
                    <td className="tabular hidden px-2 py-2.5 text-right sm:table-cell">${compact(r.avgPosition)}</td>
                    <td className="tabular hidden px-2 py-2.5 text-right sm:table-cell">{r.openValue ? `$${compact(r.openValue)}` : "—"}</td>
                    <td className="hidden px-2 py-2.5 text-right text-xs text-muted-foreground sm:table-cell">{lastActive ?? "—"}</td>
                  </>
                ) : (
                  // Most all-time leaders hold nothing open at any moment. One plain sentence
                  // across the five scan columns reads as information; five dashes read as broken.
                  <td colSpan={5} className="hidden px-2 py-2.5 text-right text-xs text-muted-foreground sm:table-cell">
                    {r.unscanned ? "New to the top since the last scan · open bets appear after the next one" : "No open bets of $100+ in the last scan"}
                  </td>
                )}
                <td className="hidden px-2 py-2.5 text-right sm:table-cell">
                  <Link href={`/wallets/${r.wallet}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline" aria-label={`Open ${r.name} in Wallet Explorer`}>
                    View <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={10} className="px-2 py-12 text-center text-sm text-muted-foreground">
                  No tracked wallet matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">
          {filtered.length ? `Showing ${current * PAGE_SIZE + 1}–${Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of ${filtered.length.toLocaleString("en-US")}` : "No results"}
          {sort === "openRoi" && " · wallets with $5,000+ deployed"}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-foreground/90 disabled:opacity-40 hover:bg-surface-2">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
          </button>
          <span className="tabular px-2">
            Page {current + 1} of {pages}
          </span>
          <button type="button" onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-foreground/90 disabled:opacity-40 hover:bg-surface-2">
            Next <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
