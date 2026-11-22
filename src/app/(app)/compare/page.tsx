import Link from "next/link";
import { ExternalLink, Scale, TrendingUp, Lock } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { runPriceLab } from "@/lib/data/price-lab";
import { OPP_LABELS } from "@/lib/analytics/line-comparison";
import { devigAll } from "@/lib/analytics/devig";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { pct, cents, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";
import type { EventComparison, OppCategory, VenueQuote } from "@/lib/data/cross-source";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const CAT_TONE: Record<OppCategory, string> = {
  strong: "border-status-good/40 bg-status-good/10 text-status-good",
  moderate: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  low: "border-chart-7/40 bg-chart-7/10 text-chart-7",
  none: "border-border bg-surface-2/40 text-muted-foreground",
  insufficient: "border-border bg-surface-2/40 text-muted-foreground",
};

function VenueCell({ q, isBest }: { q: VenueQuote; isBest: boolean }) {
  return (
    <div className={cn("rounded-lg border px-2.5 py-1.5 text-xs", isBest ? "border-status-good/50 bg-status-good/10" : "border-border/60 bg-surface-2/30")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{q.venueLabel}</span>
        {isBest && <span className="rounded bg-status-good/20 px-1 text-[9px] font-semibold uppercase text-status-good">Best</span>}
      </div>
      <div className="tabular mt-0.5 text-sm font-semibold">{q.ask !== null ? cents(q.ask) : "—"}</div>
      <div className="tabular text-[10px] text-muted-foreground">{q.freshness === "delayed" ? "delayed" : "live"}{q.spread !== null ? ` · spr ${cents(q.spread)}` : ""}</div>
    </div>
  );
}

function ComparisonCard({ c }: { c: EventComparison }) {
  return (
    <div className="card-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.subtitle}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{c.startsAt ? `Starts ${relative(c.startsAt)} · ` : ""}{c.matchReason}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {c.arbitrage && (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-good/50 bg-status-good/15 px-2 py-0.5 text-[11px] font-semibold text-status-good">
              <Lock className="size-3" /> Locked +{(c.arbitrage.profit * 100).toFixed(1)} pts
            </span>
          )}
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", CAT_TONE[c.opportunity])}>{OPP_LABELS[c.opportunity]} · {c.discrepancyScore}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {c.sides.map((s, i) => {
          const best = c.bestPrice[i];
          const fair = c.fair[i];
          return (
            <div key={s.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:grid-cols-[1.4fr_repeat(2,minmax(0,1fr))_auto]">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.label}</div>
                <div className="tabular text-[11px] text-muted-foreground">fair {fair !== undefined && !Number.isNaN(fair) ? pct(fair, 1) : "—"}</div>
              </div>
              {s.venues.map((v) => (
                <VenueCell key={v.venue} q={v} isBest={best?.venue === v.venue && v.ask !== null} />
              ))}
              <div className="hidden text-right text-[11px] sm:block">
                {best ? (
                  <span className="text-status-good">
                    best {cents(best.ask)}
                    <br />
                    <span className="text-muted-foreground">on {best.venueLabel}</span>
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </div>
          );
        })}
      </div>

      {c.bestEdge && c.bestEdge.edgePts > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/30 px-3 py-2 text-xs">
          <TrendingUp className="size-4 text-primary" />
          <span>
            Largest estimated edge: <strong>{(c.bestEdge.edgePts * 100).toFixed(1)} pts</strong> buying <strong>{c.sides[c.bestEdge.sideIndex]!.label}</strong> on {c.bestEdge.venueLabel}
            {Number.isFinite(c.bestEdge.evPerDollar) ? ` (EV ${(c.bestEdge.evPerDollar * 100).toFixed(1)}% of stake, net of fees)` : ""}. Estimate, not a recommendation.
          </span>
        </div>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-primary">De-vig breakdown, reasons &amp; caveats</summary>
        <div className="mt-2 space-y-3">
          <div>
            <div className="mb-1 font-medium text-muted-foreground">No-vig fair probability by method (each venue&apos;s own prices)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {c.sides[0]!.venues.map((v, vi) => {
                const asks = c.sides.map((s) => s.venues[vi]?.ask ?? null);
                if (asks.some((a) => a === null)) return null;
                const methods = devigAll(asks as number[]);
                return (
                  <div key={v.venue} className="rounded-lg border border-border/50 p-2">
                    <div className="mb-1 font-medium">{v.venueLabel} <span className="tabular font-normal text-muted-foreground">margin {pct(methods[0]!.overround, 1)}</span></div>
                    <table className="w-full text-[11px]">
                      <tbody>
                        {methods.map((m) => (
                          <tr key={m.method}>
                            <td className="capitalize text-muted-foreground">{m.method}{m.method === "shin" && m.insiderShare !== undefined ? ` (z=${(m.insiderShare * 100).toFixed(1)}%)` : ""}</td>
                            <td className="tabular text-right">{c.sides.map((s, si) => `${pct(m.fair[si] ?? NaN, 0)}`).join(" / ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {c.reasons.map((r) => (
              <li key={r} className="flex gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />{r}</li>
            ))}
          </ul>
          <ul className="space-y-1 text-status-warning/90">
            {c.caveats.map((r) => (
              <li key={r} className="flex gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-status-warning" />{r}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
            {c.sides.flatMap((s) => s.venues).filter((v, i, arr) => v.href && arr.findIndex((x) => x.href === v.href) === i).map((v) => {
              const linkCls = "inline-flex items-center gap-1 text-primary hover:underline";
              // One anchor per link: a plain <a> for an external venue URL, a Next <Link> for an
              // internal market route. Never an <a> wrapping a <Link> (nested anchors break hydration).
              return v.href!.startsWith("http") ? (
                <a key={v.href} href={v.href!} target="_blank" rel="noreferrer" className={linkCls}>
                  Open on {v.venueLabel} <ExternalLink className="size-3" />
                </a>
              ) : (
                <Link key={v.href} href={v.href!} className={linkCls}>
                  Open on {v.venueLabel}
                </Link>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}

export default async function ComparePage() {
  const session = await requireUser("/compare");
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.scanner) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Price-first analysis" title="Price Lab" description="Compare the same market across venues, de-vig each book, and see the best available price and estimated edge." />
        <UpgradeGate locked feature="Price Lab — cross-venue line shopping and +EV" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  }
  const result = await runPriceLab();
  trackUsage("pricelab.view", session.user.id, { matches: result.comparisons.length });
  const strong = result.comparisons.filter((c) => c.opportunity === "strong" || c.opportunity === "moderate");
  const arbs = result.comparisons.filter((c) => c.arbitrage);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Price-first analysis"
        title="Price Lab"
        description="Start from the prices, not the pick. EDGEWISE matches the same event across venues, removes each book's margin, forms a consensus fair probability, and shows you the best available price and the estimated edge — net of fees, with every number sourced."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface p-4">
          <div className="text-xs text-muted-foreground">Live venues</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-status-good" /> Kalshi</span>
            <span className="inline-flex items-center gap-1"><span className={cn("size-1.5 rounded-full", result.polymarketUp ? "bg-status-good" : "bg-status-critical")} /> Polymarket</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Both venues re-quoted live on load · {result.polyCount} Polymarket markets scanned {relative(result.generatedAt)}</div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs text-muted-foreground">Matched events</div>
          <div className="tabular mt-1 text-2xl font-semibold">{result.comparisons.length}</div>
          <div className="text-[11px] text-muted-foreground">{strong.length} notable · {arbs.length} locked edge{arbs.length === 1 ? "" : "s"}</div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs text-muted-foreground">Sportsbooks</div>
          <div className="mt-1 text-sm font-semibold text-muted-foreground">Not connected</div>
          <div className="text-[11px] text-muted-foreground">DraftKings, FanDuel, Pinnacle need a licensed odds key (integration layer ready).</div>
        </div>
      </div>

      {arbs.length > 0 && (
        <Section title="Locked cross-venue edges" description="Where the two venues disagree enough that buying each side on its cheaper venue costs under $1 for a guaranteed $1 payout. Rare, and real execution costs apply.">
          <div className="space-y-3">
            {arbs.map((c) => {
              const a = c.arbitrage!;
              return (
                <div key={c.key} className="rounded-lg border border-status-good/40 bg-status-good/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{c.title}</div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-good/15 px-2 py-0.5 text-xs font-semibold text-status-good">
                      <Lock className="size-3" /> {(a.combinedCost * 100).toFixed(1)}¢ for $1 · locked +{(a.profit * 100).toFixed(1)} pts ({(a.roi * 100).toFixed(1)}% ROI)
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {a.legs.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 text-sm">
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">Buy</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{l.sideLabel}</span>
                        <span className="tabular font-semibold">{cents(l.ask)}</span>
                        <span className="text-xs text-muted-foreground">on {l.venueLabel}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{c.caveats[0]}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section
        title="Line comparison & best odds"
        description="Each row shows the buy price for a side on every connected venue. The cheaper price is the better buy — that is objective. Fair probability and edge are labeled estimates."
      >
        {result.comparisons.length ? (
          <div className="space-y-3">
            {result.comparisons.map((c) => (
              <ComparisonCard key={c.key} c={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Scale />}
            title={result.polymarketUp ? "No equivalent markets matched right now" : "Polymarket could not be reached"}
            description={result.polymarketUp ? "Matches appear when the same game or event is open on both Kalshi and Polymarket — most common on game days. The honest result off-hours is an empty table." : "The comparison needs a second live venue. Kalshi data is still available across the rest of the app."}
          />
        )}
      </Section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        &quot;Best price&quot; is a factual comparison of what each venue charges, i.e. line shopping. Fair probability (liquidity-weighted, de-vigged) and estimated edge are uncertain model outputs, not advice to wager. A positive edge is a prompt to research the settlement rules and news, never a guaranteed profit; fees, spread, liquidity and model error all apply. EDGEWISE does not place wagers. Must be 18+.
      </p>
    </div>
  );
}
