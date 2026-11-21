"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { TraderIdentity } from "@/components/intel/trader-identity";
import { compact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

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
}

type SortKey = "rank" | "pnl" | "openRoi" | "positions" | "avgPosition" | "openValue" | "lastActive";

const PRESETS: Array<{ label: string; sort: SortKey; title: string }> = [
  { label: "Highest profit", sort: "pnl", title: "Polymarket leaderboard profit" },
  { label: "Highest open ROI", sort: "openRoi", title: "Unrealized return on open positions, among wallets with at least $5,000 deployed" },
  { label: "Most active", sort: "positions", title: "Most open positions right now" },
  { label: "Recently active", sort: "lastActive", title: "Most recent activity on an open position" },
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

function SortHeader({ label, k, sort, dir, onSort, align = "right", sup }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right"; sup?: string }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-2 font-medium", align === "right" && "text-right")}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-[0.12em] hover:text-foreground", active && "text-foreground")}>
        {label}
        {sup && <sup>{sup}</sup>}
        {active ? dir === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

/** The tracked-wallet leaderboard: search, ranking presets, sortable columns and pages, all on real scan figures. */
export function LeaderboardTable({ rows }: { rows: LeaderRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let r = needle ? rows.filter((x) => x.name.toLowerCase().includes(needle) || x.wallet.toLowerCase().includes(needle)) : rows;
    if (sort === "openRoi") r = r.filter((x) => x.openRoi !== null && x.openCost >= MIN_ROI_COST);
    return [...r].sort((a, b) => (dir === "asc" ? value(a, sort) - value(b, sort) : value(b, sort) - value(a, sort)));
  }, [rows, query, sort, dir]);

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
                sort === p.sort ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground hover:border-border hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          <span title="Polymarket's public API does not publish closed-trade outcomes, so win rate cannot be computed honestly." className="cursor-not-allowed rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground/60">
            Best win rate · not published
          </span>
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface-1">
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <SortHeader label="#" k="rank" sort={sort} dir={dir} onSort={onSort} align="left" />
              <th scope="col" className="px-2 py-2 font-medium uppercase tracking-[0.12em]">Trader</th>
              <SortHeader label="Total profit" k="pnl" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Open ROI" k="openRoi" sort={sort} dir={dir} onSort={onSort} />
              <th scope="col" className="px-2 py-2 text-right font-medium uppercase tracking-[0.12em]">Win rate</th>
              <SortHeader label="Positions" k="positions" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Avg position" k="avgPosition" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Exposure" k="openValue" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Last active" k="lastActive" sort={sort} dir={dir} onSort={onSort} />
              <th scope="col" className="px-2 py-2"><span className="sr-only">Open profile</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.wallet} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/40">
                <td className="tabular px-2 py-2.5 font-mono text-xs text-muted-foreground">{r.rank}</td>
                <td className="max-w-[260px] px-2 py-2.5">
                  <TraderIdentity wallet={r.wallet} name={r.name} size={26} />
                </td>
                <td className="tabular px-2 py-2.5 text-right font-medium">${compact(r.pnl)}</td>
                <td className={cn("tabular px-2 py-2.5 text-right", r.openRoi === null ? "text-muted-foreground" : r.openRoi < 0 ? "text-chart-2" : "")}>
                  {r.openRoi === null ? "—" : `${r.openRoi >= 0 ? "+" : ""}${pct(r.openRoi, 1)}`}
                </td>
                <td className="tabular px-2 py-2.5 text-right text-muted-foreground" aria-label="Not published">—</td>
                <td className="tabular px-2 py-2.5 text-right">{r.positions}</td>
                <td className="tabular px-2 py-2.5 text-right">{r.positions ? `$${compact(r.avgPosition)}` : "—"}</td>
                <td className="tabular px-2 py-2.5 text-right">{r.openValue ? `$${compact(r.openValue)}` : "—"}</td>
                <td className="px-2 py-2.5 text-right text-xs text-muted-foreground">{r.lastActiveLabel ?? "—"}</td>
                <td className="px-2 py-2.5 text-right">
                  <Link href={`/wallets/${r.wallet}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline" aria-label={`Open ${r.name} in Wallet Explorer`}>
                    View <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
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
