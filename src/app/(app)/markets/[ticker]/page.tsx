import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Bot } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getMarketDetail } from "@/lib/data/markets";
import { impliedProbability, spread } from "@/lib/data/types";
import { approxKalshiFeePerContract } from "@/lib/analytics/probability";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DataBadge } from "@/components/shared/data-badge";
import { ConfidenceBadge } from "@/components/shared/badges";
import { StatCard } from "@/components/shared/stat-card";
import { ProbabilityBar } from "@/components/shared/probability-bar";
import { ProbabilityHistoryChart } from "@/components/charts/probability-history-chart";
import { WatchButton } from "@/components/shared/watch-button";
import { PredictionDialog } from "@/components/shared/prediction-dialog";
import { ReportButton } from "@/components/shared/report-button";
import { pct, cents, compact, relative, dateTime, pts } from "@/lib/format";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";
import { isPast } from "@/lib/time";
import { LinkButton } from "@/components/ui/link-button";

const RANGES = [1, 7, 30, 90, 365, 730];

export default async function MarketPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ days?: string }> }) {
  const { ticker } = await params;
  const sp = await searchParams;
  const session = await requireUser(`/markets/${ticker}`);
  const ent = await getEntitlements(session.user.id);
  const requested = Number(sp.days ?? 30) || 30;
  const days = Math.min(requested, ent.limits.marketHistoryDays);
  const detail = await getMarketDetail(ticker.toUpperCase(), days);
  if (!detail) notFound();
  const { market: m, model, candles, movement, siblings, series, trades, event } = detail;
  const watched = await db.watchlistItem.findUnique({ where: { userId_kind_refId: { userId: session.user.id, kind: "market", refId: m.ticker } } });
  trackUsage("markets.detail", session.user.id, { ticker: m.ticker });
  const p = impliedProbability(m);
  const sprd = spread(m);
  const fee = p !== null ? approxKalshiFeePerContract(p) : null;
  const label = `${m.title}${m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}`;
  const tradingClosed = Boolean(m.result) || isPast(m.closeTime);
  const history = candles.map((c) => ({ ts: c.ts, close: c.close, bid: c.yesBidClose, ask: c.yesAskClose, volume: c.volume }));

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/markets" className="hover:text-foreground">Markets</Link> / <Link href={`/markets?category=${encodeURIComponent(m.category)}`} className="hover:text-foreground">{m.category}</Link> / <span className="font-mono">{m.ticker}</span></div>
      <PageHeader
        title={m.title}
        description={<span className="flex flex-wrap items-center gap-2">{m.yesSubTitle && <span className="font-medium text-foreground">{m.yesSubTitle}</span>}<DataBadge provenance={m.provenance} /><span>Status: {m.status}</span>{m.result && <span className="font-medium">Result: {m.result.toUpperCase()}</span>}</span>}
        actions={
          <>
            <WatchButton kind="market" refId={m.ticker} label={label} initial={Boolean(watched)} />
            <PredictionDialog target={{ domain: "market", ticker: m.ticker }} question={label} sides={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]} referenceProb={p} referenceLabel="Market implied" disabledReason={tradingClosed ? "Trading has closed for this market" : null} />
            <ReportButton subjectKind="market" subjectRef={m.ticker} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Implied probability" value={pct(p, 1)} hint="Mid of best bid and ask" />
        <StatCard label="Bid / Ask" value={`${cents(m.yesBid)} / ${cents(m.yesAsk)}`} hint={sprd !== null ? `Spread ${cents(sprd)}${sprd >= 0.05 ? " · wide" : ""}` : "One-sided book"} />
        <StatCard label="24h volume" value={compact(m.volume24h)} hint={`Total ${compact(m.volume)} contracts`} />
        <StatCard label="Open interest" value={compact(m.openInterest)} hint="Outstanding contracts" />
        <StatCard label="Closes" value={relative(m.closeTime)} hint={dateTime(m.closeTime)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Probability history"
          description={`${detail.candlePeriod === "hourly" ? "Hourly" : "Daily"} candles · ${detail.historyDays} day${detail.historyDays === 1 ? "" : "s"} · Kalshi`}
          className="lg:col-span-2"
          right={
            <div className="flex gap-1">
              {RANGES.map((r) => {
                const allowed = r <= ent.limits.marketHistoryDays;
                return allowed ? (
                  <Link key={r} href={`/markets/${m.ticker}?days=${r}`} className={cn("rounded-md px-2 py-0.5 text-[11px]", days === r ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>{r >= 365 ? `${r / 365}y` : `${r}d`}</Link>
                ) : (
                  <Link key={r} href="/pricing" title="Upgrade for longer history" className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/40 line-through">{r >= 365 ? `${r / 365}y` : `${r}d`}</Link>
                );
              })}
            </div>
          }
        >
          <ProbabilityHistoryChart data={history} period={detail.candlePeriod} marker={model.estimate !== null ? { value: model.estimate, label: "Model" } : null} />
          {requested > days && <p className="mt-2 text-[11px] text-muted-foreground">Your plan shows {ent.limits.marketHistoryDays} days of history. <Link href="/pricing" className="text-primary hover:underline">Upgrade</Link> for up to 2 years.</p>}
          {movement && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Change over window</dt><dd className={cn("tabular text-sm font-semibold", movement.change > 0 ? "text-status-good" : movement.change < 0 ? "text-status-critical" : "")}>{pts(movement.change, 1)}</dd></div>
              <div><dt className="text-muted-foreground">Range</dt><dd className="tabular text-sm font-semibold">{pct(movement.low, 0)} – {pct(movement.high, 0)}</dd></div>
              <div><dt className="text-muted-foreground">Biggest move</dt><dd className="tabular text-sm font-semibold">{pts(movement.biggestMove.delta, 0)} <span className="font-normal text-muted-foreground">{movement.biggestMove.ts ? dateTime(new Date(movement.biggestMove.ts * 1000)) : ""}</span></dd></div>
              <div><dt className="text-muted-foreground">Volatility (σ)</dt><dd className="tabular text-sm font-semibold">{(movement.volatility * 100).toFixed(1)} pts</dd></div>
            </dl>
          )}
          {detail.ownSnapshots.length >= 3 && <p className="mt-3 text-[11px] text-muted-foreground">EDGEWISE has recorded {detail.ownSnapshots.length} of its own price snapshots for this market since {dateTime(detail.ownSnapshots[0]!.ts)}.</p>}
        </Section>

        <Section title="Probability analysis" description="Market view vs. heuristic model" right={<ConfidenceBadge level={model.confidence} />}>
          <ProbabilityBar market={model.marketProb} model={model.estimate} />
          <dl className="mt-4 space-y-2 text-xs">
            {[
              ["Market price (last trade)", cents(m.lastPrice), "fact"],
              ["Implied probability (mid)", pct(p, 1), "fact"],
              ["Recent trading mean (7 periods)", model.inputs.recentMean !== null ? pct(model.inputs.recentMean, 1) : "n/a", "fact"],
              [`Model estimate (${model.modelVersion})`, pct(model.estimate, 1), "estimate"],
              ["Difference", model.diffPts !== null ? pts(model.diffPts, 1) : "—", "estimate"],
              ["After approx. fee", model.netOfFeesDiff !== null ? pts(model.netOfFeesDiff, 1) : "—", "estimate"],
              ["Approx. taker fee", fee !== null ? cents(fee) : "—", "fact"],
              ["Data freshness", `${m.provenance.freshness} · ${relative(m.provenance.fetchedAt)}`, "fact"],
            ].map(([k, v, kind]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                <dt className="text-muted-foreground">{k} <span className={cn("ml-1 rounded px-1 text-[9px] uppercase", kind === "fact" ? "bg-surface-3 text-muted-foreground" : "bg-chart-7/15 text-chart-7")}>{kind}</span></dt>
                <dd className="tabular font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-primary">How the model got here</summary>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              {model.explanation.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
          <div className="mt-3 rounded-lg border border-status-warning/30 bg-status-warning/5 p-2.5 text-[11px] text-muted-foreground">
            <div className="mb-1 font-medium text-status-warning">Uncertainty factors</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {model.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <LinkButton href={`/analyst?context=${encodeURIComponent(`market:${m.ticker}`)}`} variant="outline" size="sm" className="mt-3 w-full">
            <Bot className="size-4" /> Ask the analyst about this market
          </LinkButton>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Resolution criteria" description="Verbatim from the exchange" className="lg:col-span-2">
          <p className="text-sm leading-relaxed">{m.rulesPrimary ?? "No primary rules provided."}</p>
          {m.rulesSecondary && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.rulesSecondary}</p>}
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Opens</dt><dd>{dateTime(m.openTime)}</dd></div>
            <div><dt className="text-muted-foreground">Trading closes</dt><dd>{dateTime(m.closeTime)}</dd></div>
            <div><dt className="text-muted-foreground">Expiration</dt><dd>{dateTime(m.expirationTime)}</dd></div>
          </dl>
          {(event?.settlementSources?.length || series?.settlementSources?.length) ? (
            <div className="mt-4 text-xs">
              <div className="mb-1 text-muted-foreground">Settlement sources</div>
              <ul className="flex flex-wrap gap-2">
                {[...(event?.settlementSources ?? []), ...(series?.settlementSources ?? [])].filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i).map((s) => (
                  <li key={s.name}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{s.name} <ExternalLink className="size-3" /></a> : s.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {series && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Series: {series.title}</span>
              {series.feeType && <span>Fee type: {series.feeType}</span>}
              {series.contractUrl && <a href={series.contractUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Contract terms <ExternalLink className="size-3" /></a>}
              <a href={`https://kalshi.com/markets/${m.seriesTicker.toLowerCase()}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">View on Kalshi <ExternalLink className="size-3" /></a>
            </div>
          )}
        </Section>
        <Section title="Recent trades" description="Latest public prints">
          {trades.length ? (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Time</th><th className="py-1 font-medium">YES price</th><th className="py-1 font-medium">Size</th><th className="py-1 font-medium">Taker</th></tr></thead>
              <tbody>
                {trades.slice(0, 12).map((t) => (
                  <tr key={t.id} className="border-t border-border/40"><td className="tabular py-1 text-muted-foreground">{relative(t.ts)}</td><td className="tabular py-1">{cents(t.yesPrice)}</td><td className="tabular py-1">{compact(t.count)}</td><td className={cn("py-1 uppercase", t.takerSide === "yes" ? "text-status-good" : "text-status-critical")}>{t.takerSide}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">No recent trades returned.</p>
          )}
        </Section>
      </div>

      {siblings.length > 0 && (
        <Section title={event?.title ?? "Related markets"} description={event?.mutuallyExclusive ? "Mutually exclusive outcomes in this event" : "Other markets in this event"}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((s) => {
              const sp2 = impliedProbability(s);
              return (
                <li key={s.ticker}>
                  <Link href={`/markets/${s.ticker}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/40">
                    <span className="truncate">{s.yesSubTitle ?? s.title}</span>
                    <span className="tabular shrink-0 font-semibold">{pct(sp2, 0)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
