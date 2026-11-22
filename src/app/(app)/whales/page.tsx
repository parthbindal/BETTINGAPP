import { after } from "next/server";
import Link from "next/link";
import { Waves, TrendingUp, TrendingDown, Users, Check, X, Trophy, Clock, ArrowLeftRight } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, syncWhaleWatch, type ConsensusHolding, type WhalePayload } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { UpgradeGate } from "@/components/shared/badges";
import { usd, compact, pct, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logError, trackUsage } from "@/lib/ops";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { WhaleHeroCarousel, type HeroPick } from "@/components/whales/hero-carousel";
import { dateTime } from "@/lib/format";
import { isInPlay, polymarketMarketUrl } from "@/lib/intel";
import { OpenOnPolymarket } from "@/components/intel/open-on-polymarket";

const CATS = ["All", "Sports", "Politics", "Crypto", "Economics", "Other"];
const STALE_MS = 5 * 60_000; // auto-refresh in the background when older than this

// Exact market link when the scan has its slugs; a Polymarket search otherwise.
function polyUrl(h: ConsensusHolding) {
  return polymarketMarketUrl(h.slug, h.marketSlug) ?? `https://polymarket.com/markets?_q=${encodeURIComponent(h.title.slice(0, 40))}`;
}
function moveUrl(eventSlug: string | null, title: string, marketSlug?: string | null) {
  return polymarketMarketUrl(eventSlug, marketSlug) ?? `https://polymarket.com/markets?_q=${encodeURIComponent(title.slice(0, 40))}`;
}

/** A plain-English statement of the bet (what side they are on, in words). */
function describeBet(h: ConsensusHolding): string {
  const q = h.title.trim().replace(/\?+$/, "");
  const yes = /^yes$/i.test(h.outcome);
  const no = /^no$/i.test(h.outcome);
  const willMatch = /^will\s+(.*)/i.exec(q);
  if (willMatch) {
    const base = willMatch[1]!.charAt(0).toUpperCase() + willMatch[1]!.slice(1);
    if (yes) return `${base} — they expect YES`;
    if (no) return `${base} — they expect NO (it will not happen)`;
  }
  if (/\bvs\.?\b/i.test(q) && !yes && !no) return `${h.outcome} to win (${q})`;
  if (yes) return `YES on: ${q}`;
  if (no) return `NO on: ${q} (they expect it will not happen)`;
  return `${h.outcome} — ${q}`;
}

function EarnerCard({ h, rank, field }: { h: ConsensusHolding; rank: number; field: number }) {
  const up = h.unrealizedPnl >= 0;
  const yes = /^yes$/i.test(h.outcome);
  const no = /^no$/i.test(h.outcome);
  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
          <Trophy className="size-3" /> #{rank} biggest profit
        </span>
        <OpenOnPolymarket variant="ghost-icon" title={h.title} outcome={h.outcome} eventSlug={h.slug} marketSlug={h.marketSlug} inPlay={isInPlay(h)} />
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug">
        <span className={cn("mr-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold", yes ? "bg-status-good/15 text-status-good" : no ? "bg-status-critical/15 text-status-critical" : "bg-primary/15 text-primary")}>
          {yes && <Check className="size-3" />}
          {no && <X className="size-3" />}
          {h.outcome}
        </span>
        {describeBet(h)}
      </p>
      <div className={cn("mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold", up ? "bg-status-good/10 text-status-good" : "bg-status-critical/10 text-status-critical")}>
        {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        {up ? "Up " : "Down "}
        {usd(Math.abs(h.unrealizedPnl), 0)} so far
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" /><span className="tabular font-semibold text-foreground">{h.holders}</span> of {compact(field)} hold it</span>
        <span className="tabular">bought {Math.round(h.avgEntry * 100)}¢ → now {Math.round(h.currentPrice * 100)}¢</span>
      </div>
    </div>
  );
}

export default async function WhalesPage({ searchParams }: { searchParams: Promise<{ cat?: string; sort?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/whales");
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.scanner) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="On-chain intelligence" title="Whale Watch" description="What the most-profitable Polymarket traders are making their money on right now." />
        <UpgradeGate locked feature="Whale Watch — top-trader position tracking" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  }

  const data = await getWhaleWatch();
  if (!data || data.ageMs > STALE_MS) {
    after(async () => {
      try {
        await syncWhaleWatch({ topN: 1000 });
      } catch (e) {
        await logError("whales.background", e);
      }
    });
  }
  trackUsage("whales.view", session.user.id);

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="On-chain intelligence" title="Whale Watch" description="What the most-profitable Polymarket traders are making their money on." />
        <EmptyState icon={<Waves />} title="Building the first snapshot" description="Scanning the top 1,000 traders' live positions from Polymarket (about a minute). Refresh shortly." />
      </div>
    );
  }

  const p: WhalePayload = data.payload;
  const cat = CATS.includes(sp.cat ?? "") ? sp.cat! : "All";
  const sort = sp.sort === "value" ? "value" : sp.sort === "holders" ? "holders" : "profit";
  const field = p.tradersScanned;

  // What the top earners are making the most money on (largest aggregate profit first).
  const byProfit = [...p.holdings].sort((a, b) => b.unrealizedPnl - a.unrealizedPnl);
  const winners = byProfit.filter((h) => h.unrealizedPnl > 0);
  const topEarner = byProfit[0];
  const totalOpenProfit = p.holdings.reduce((a, h) => a + Math.max(0, h.unrealizedPnl), 0);
  // This section reads as "bought"; sells live in the Activity Feed.
  const recentMoves = (p.recentMoves ?? []).filter((m) => m.side === "BUY");
  const similarPairs = p.similarPairs ?? [];
  const heroPicks: HeroPick[] = byProfit.slice(0, 10).map((h) => ({
    statement: describeBet(h),
    outcome: h.outcome,
    pnl: h.unrealizedPnl,
    holders: h.holders,
    field,
    avgEntryPct: Math.round(h.avgEntry * 100),
    currentPct: Math.round(h.currentPrice * 100),
    url: polyUrl(h),
    category: h.category,
  }));

  const sortFn = (a: ConsensusHolding, b: ConsensusHolding) =>
    sort === "value" ? b.totalValue - a.totalValue : sort === "holders" ? b.holders - a.holders || b.totalValue - a.totalValue : b.unrealizedPnl - a.unrealizedPnl;
  const holdings = (cat === "All" ? p.holdings : p.holdings.filter((h) => h.category === cat)).slice().sort(sortFn).slice(0, 60);
  const link = (patch: Record<string, string>) => `/whales?${new URLSearchParams({ cat, sort, ...patch }).toString()}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="On-chain intelligence"
        title="Whale Watch"
        description="Polymarket is on-chain, so every wallet's positions are public. This reads the 1,000 most-profitable traders and shows, in plain English, what they are making their money on right now. Confirmed data, not tips."
        actions={<WhaleRefreshButton />}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-status-good" /> Live from Polymarket&apos;s on-chain API</span>
        <span>·</span>
        <span>Snapshot taken <span className="font-medium text-foreground">{relative(p.generatedAt)}</span> ({dateTime(p.generatedAt)})</span>
        <span>·</span>
        <span>Auto-rescans every few minutes; prices refresh each scan, not tick-by-tick. Hit &quot;Refresh now&quot; to rescan on demand.</span>
      </div>

      {heroPicks.length > 0 && <WhaleHeroCarousel picks={heroPicks} />}

      <div className="rounded-lg border border-border/70 bg-surface-2/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">How to read this, straight:</span> each card shows a real position these profitable traders hold and how much they are up or down on it right now — that is confirmed on-chain fact. It is <em>not</em> a buy signal: you are seeing them part-way through, often already in profit from a much lower entry, and a profit leaderboard only shows who is winning today (never who blew up). Treat a big position as a reason to research the market, not to copy it. EDGEWISE does not place bets.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Traders tracked" value={compact(field)} hint="The most-profitable wallets on Polymarket" icon={<Waves />} />
        <StatCard label="Live positions scanned" value={compact(p.positionsScanned)} hint={`Updated ${relative(p.generatedAt)}`} />
        <StatCard label="Open profit on these bets" value={usd(totalOpenProfit, 0)} hint="Total they are currently up across the positions below" icon={<Trophy />} />
        <StatCard label="Biggest single winner" value={topEarner ? usd(Math.max(0, topEarner.unrealizedPnl), 0) : "—"} hint={topEarner ? describeBet(topEarner).slice(0, 40) : ""} />
      </div>

      <Section title="What the top earners are making money on" description="The positions these profitable traders are up the most on right now, in plain English. Biggest profit first.">
        {winners.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {winners.slice(0, 9).map((h, i) => (
              <EarnerCard key={h.tokenId} h={h} rank={i + 1} field={field} />
            ))}
          </div>
        ) : (
          <EmptyState title="No open winners in this snapshot" description="None of the tracked positions are currently in profit. Check back after the next refresh." />
        )}
      </Section>

      {recentMoves.length > 0 && (
        <Section title="Latest bets from the best traders" description="The most recent buys by the top traders, newest first. Live from Polymarket.">
          <ul className="divide-y divide-border/60">
            {recentMoves.slice(0, 18).map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm">
                <span className="tabular w-10 shrink-0 text-[11px] text-muted-foreground">#{m.rank}</span>
                <span className="font-medium">{m.trader}</span>
                <span className="text-muted-foreground">bought</span>
                <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold", /^yes$/i.test(m.outcome) ? "bg-status-good/15 text-status-good" : /^no$/i.test(m.outcome) ? "bg-status-critical/15 text-status-critical" : "bg-primary/15 text-primary")}>{m.outcome}</span>
                <a href={moveUrl(m.eventSlug, m.title, m.marketSlug)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-muted-foreground hover:text-primary hover:underline">{m.title}</a>
                <span className="tabular shrink-0 font-medium">{usd(m.usd, 0)}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">at {m.pricePct}¢</span>
                <span className="shrink-0 text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock className="size-3" />{relative(m.tsIso)}</span>
                <OpenOnPolymarket variant="ghost-icon" title={m.title} outcome={m.outcome} eventSlug={m.eventSlug} marketSlug={m.marketSlug} inPlay={isInPlay({ currentPrice: m.pricePct / 100 })} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {similarPairs.length > 0 && (
        <Section title="Top traders making the same picks" description="Pairs of top traders whose recent bets overlap the most — who is moving together right now.">
          <div className="grid gap-3 sm:grid-cols-2">
            {similarPairs.slice(0, 8).map((pr, i) => (
              <div key={i} className="card-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{pr.a}</span>
                  <ArrowLeftRight className="size-3.5 text-primary" />
                  <span>{pr.b}</span>
                  <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">{pr.shared} shared</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">#{pr.aRank} and #{pr.bRank} on the leaderboard · both recently bought:</div>
                <ul className="mt-2 space-y-1 text-xs">
                  {pr.markets.map((mk, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="mt-0.5 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold">{mk.outcome}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{mk.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Overlap is based on the exact side of the exact market each trader recently bought. Shared positions can reflect a common read — or simply that both were active on the same busy slate. It is not confirmation either is right.</p>
        </Section>
      )}

      <Section
        title="Full breakdown"
        description="Every position these traders hold, filterable. Sort by profit, how many hold it, or how much capital is on it."
        right={
          <div className="flex gap-1 text-xs">
            <Link href={link({ sort: "profit" })} className={cn("rounded-md px-2 py-1", sort === "profit" ? "bg-surface-2 text-foreground" : "text-muted-foreground")}>Most profit</Link>
            <Link href={link({ sort: "holders" })} className={cn("rounded-md px-2 py-1", sort === "holders" ? "bg-surface-2 text-foreground" : "text-muted-foreground")}>Most held</Link>
            <Link href={link({ sort: "value" })} className={cn("rounded-md px-2 py-1", sort === "value" ? "bg-surface-2 text-foreground" : "text-muted-foreground")}>Most capital</Link>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <Link key={c} href={link({ cat: c })} className={cn("rounded-full border px-2.5 py-1 text-xs", cat === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>
              {c}
              {c !== "All" && <span className="ml-1 text-muted-foreground">{p.categories.find((x) => x.category === c)?.holdings ?? 0}</span>}
            </Link>
          ))}
        </div>
        {holdings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">The bet (plain English)</th>
                  <th className="px-2 py-2 text-right font-medium">Up / down so far</th>
                  <th className="px-2 py-2 text-right font-medium">Traders</th>
                  <th className="px-2 py-2 text-right font-medium">Entry → now</th>
                  <th className="px-2 py-2 text-right font-medium">Capital</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const up = h.unrealizedPnl >= 0;
                  return (
                    <tr key={h.tokenId} className="border-b border-border/50 last:border-0 hover:bg-surface-2/30">
                      <td className="px-2 py-2.5">
                        <div className="font-medium">{describeBet(h)}</div>
                        <div className="text-[11px] text-muted-foreground">{h.category}{h.endDate ? ` · resolves ${relative(h.endDate)}` : ""}</div>
                      </td>
                      <td className={cn("tabular px-2 py-2.5 text-right font-semibold", up ? "text-status-good" : "text-status-critical")}>
                        <span className="inline-flex items-center justify-end gap-1">{up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{up ? "+" : "−"}{usd(Math.abs(h.unrealizedPnl), 0)}</span>
                      </td>
                      <td className="tabular px-2 py-2.5 text-right">{h.holders} <span className="text-[11px] text-muted-foreground">({pct(h.pctOfField, 1)})</span></td>
                      <td className="tabular px-2 py-2.5 text-right text-muted-foreground">{Math.round(h.avgEntry * 100)}¢ → {Math.round(h.currentPrice * 100)}¢</td>
                      <td className="tabular px-2 py-2.5 text-right">{usd(h.totalValue, 0)}</td>
                      <td className="px-2 py-2.5 text-right"><OpenOnPolymarket variant="ghost-icon" title={h.title} outcome={h.outcome} eventSlug={h.slug} marketSlug={h.marketSlug} inPlay={isInPlay(h)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No positions in this category" />
        )}
      </Section>

      <Section title="The leaderboard" description="The most-profitable Polymarket traders (their public leaderboard). Names are self-set wallet labels, not verified identities.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Trader</th>
                <th className="px-2 py-1.5 text-right font-medium">Total profit</th>
                <th className="px-2 py-1.5 font-medium">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {p.leaderboard.slice(0, 20).map((t) => (
                <tr key={t.wallet} className="border-t border-border/40">
                  <td className="tabular px-2 py-1.5 text-muted-foreground">{t.rank}</td>
                  <td className="px-2 py-1.5 font-medium">{t.name}{t.verified && <span className="ml-1 text-primary">✓</span>}</td>
                  <td className="tabular px-2 py-1.5 text-right text-status-good">{usd(t.pnl, 0)}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">{t.wallet.slice(0, 10)}…{t.wallet.slice(-6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Source: Polymarket public v2 Data API (on-chain), snapshot {relative(p.generatedAt)}. Positions are live and change constantly. &quot;Up / down so far&quot; is unrealized profit at the current price. EDGEWISE shows confirmed on-chain activity to help you research, not advice to copy. It does not place wagers. Must be 18+. This is only possible for Polymarket because it is on-chain; Kalshi and sportsbooks keep positions private.
      </p>
    </div>
  );
}
