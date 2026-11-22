import Link from "next/link";
import { requireUser, getEntitlements } from "@/lib/session";
import { listMarkets, getCategoryCounts, type MarketSort } from "@/lib/data/markets";
import { ensureMarketsFresh } from "@/lib/data/market-freshness";
import { impliedProbability, spread } from "@/lib/data/types";
import { PageHeader, EmptyState } from "@/components/shared/page-header";
import { DataBadge } from "@/components/shared/data-badge";
import { pct, cents, compact, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { WatchButton } from "@/components/shared/watch-button";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const SORTS: Array<{ v: MarketSort; l: string }> = [
  { v: "volume24h", l: "Most active (24h)" },
  { v: "volume", l: "Total volume" },
  { v: "movers", l: "Biggest moves" },
  { v: "closing", l: "Closing soonest" },
  { v: "newest", l: "Newest" },
];

export default async function MarketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireUser("/markets");
  const ent = await getEntitlements(session.user.id);
  await ensureMarketsFresh().catch(() => {});
  const category = sp.category || undefined;
  const q = sp.q?.trim() || undefined;
  const sort = (SORTS.some((s) => s.v === sp.sort) ? sp.sort : "volume24h") as MarketSort;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const perPage = 25;
  const capped = Math.min(ent.limits.marketListLimit, 5000);
  const offset = Math.min((page - 1) * perPage, Math.max(0, capped - perPage));
  const [{ items, total }, cats, watched] = await Promise.all([
    listMarkets({ category, q, sort, limit: perPage, offset }),
    getCategoryCounts(),
    db.watchlistItem.findMany({ where: { userId: session.user.id, kind: "market" }, select: { refId: true } }),
  ]);
  trackUsage("markets.list", session.user.id, { category, q, sort });
  const watchedSet = new Set(watched.map((w) => w.refId));
  const visibleTotal = Math.min(total, capped);
  const pages = Math.max(1, Math.ceil(visibleTotal / perPage));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { category, q, sort, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/markets?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Markets" description="Open Kalshi prediction markets with implied probability, liquidity and resolution rules. Prices are public exchange data cached by EDGEWISE; each row shows its freshness." actions={items[0] && <DataBadge provenance={items[0].provenance} />} />

      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" action="/markets" method="get">
        {category && <input type="hidden" name="category" value={category} />}
        <input name="q" defaultValue={q} placeholder="Search markets, e.g. inflation, Fed, Speaker, World Cup" autoFocus={sp.focus === "search"} className="h-9 flex-1 rounded-lg border border-input bg-surface-2/40 px-3 text-sm placeholder:text-muted-foreground/70" />
        <select name="sort" defaultValue={sort} className="h-9 rounded-lg border border-input bg-surface-2/40 px-3 text-sm">
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>{s.l}</option>
          ))}
        </select>
        <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85">Apply</button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        <Link href={link({ category: undefined, page: "1" })} className={cn("rounded-full border px-2.5 py-1 text-xs", !category ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>All</Link>
        {cats.map((c) => (
          <Link key={c.category} href={link({ category: c.category, page: "1" })} className={cn("rounded-full border px-2.5 py-1 text-xs", category === c.category ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>
            {c.category} <span className="text-muted-foreground">{c.count}</span>
          </Link>
        ))}
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Market</th>
              <th className="px-3 py-2.5 font-medium">Implied</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Bid / Ask</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">24h vol</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Open int.</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Closes</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const p = impliedProbability(m);
              const sp2 = spread(m);
              const delta = m.lastPrice !== null && m.previousPrice !== null ? m.lastPrice - m.previousPrice : null;
              return (
                <tr key={m.ticker} className="border-b border-border/50 last:border-0 hover:bg-surface-2/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/markets/${m.ticker}`} className="block">
                      <div className="font-medium leading-snug hover:text-primary">{m.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {m.yesSubTitle && <span>{m.yesSubTitle}</span>}
                        <span>{m.category}</span>
                        <span className="font-mono text-[10px]">{m.ticker}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="tabular px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="hidden h-1.5 w-16 rounded-full bg-surface-3 sm:block"><div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${(p ?? 0) * 100}%` }} /></div>
                      <span className="font-semibold">{pct(p, 0)}</span>
                      {delta !== null && Math.abs(delta) >= 0.01 && <span className={cn("text-[11px]", delta > 0 ? "text-status-good" : "text-status-critical")}>{delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}</span>}
                    </div>
                  </td>
                  <td className="tabular hidden px-3 py-2.5 text-muted-foreground md:table-cell">{cents(m.yesBid)} / {cents(m.yesAsk)}{sp2 !== null && sp2 >= 0.05 && <span className="ml-1 text-status-warning" title="Wide spread">●</span>}</td>
                  <td className="tabular hidden px-3 py-2.5 sm:table-cell">{compact(m.volume24h)}</td>
                  <td className="tabular hidden px-3 py-2.5 text-muted-foreground lg:table-cell">{compact(m.openInterest)}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{relative(m.closeTime)}</td>
                  <td className="px-3 py-2.5 text-right"><WatchButton kind="market" refId={m.ticker} label={`${m.title}${m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}`} initial={watchedSet.has(m.ticker)} size="icon-sm" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <EmptyState title="No markets match" description="Try a broader search or another category." />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {items.length ? offset + 1 : 0}–{offset + items.length} of {visibleTotal.toLocaleString()} {total > capped && <span>(plan shows {capped.toLocaleString()} of {total.toLocaleString()}; <Link href="/pricing" className="text-primary hover:underline">upgrade</Link> for more)</span>}
        </span>
        <div className="flex gap-1">
          <Link aria-disabled={page <= 1} href={link({ page: String(Math.max(1, page - 1)) })} className={cn("rounded-lg border px-2.5 py-1", page <= 1 && "pointer-events-none opacity-40")}>Prev</Link>
          <span className="px-2 py-1">Page {page} / {pages}</span>
          <Link aria-disabled={page >= pages} href={link({ page: String(Math.min(pages, page + 1)) })} className={cn("rounded-lg border px-2.5 py-1", page >= pages && "pointer-events-none opacity-40")}>Next</Link>
        </div>
      </div>
    </div>
  );
}
