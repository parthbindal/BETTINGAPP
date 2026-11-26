import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Crown, ScrollText, Sparkles, Users } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, keepScanFresh } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { db } from "@/lib/db";
import { Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { PriceTrack, SidePill, SignalBadge } from "@/components/intel/signal";
import { TradeRow } from "@/components/intel/trade-row";
import { OpenOnPolymarket } from "@/components/intel/open-on-polymarket";
import { OwnershipBar } from "@/components/intel/ownership";
import { EntryTimeline } from "@/components/charts/entry-timeline";
import { compact, dateShort, relative } from "@/lib/format";
import { ageMs, explainSplit, freePreviewTokens, isInPlay, kindLabel, readConsensus, walletHref } from "@/lib/intel";
import { CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const DAY_MS = 86_400_000;
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);

/** One fact with its label, sized to sit in the hero's side panel. */
function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface-1/60 p-3.5">
      <div className="label-micro">{label}</div>
      <div className="figure mt-1.5 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * One signal in depth: the "god mode" for a single market side. Everything on
 * the page is read from the latest Polymarket scan and the public signal
 * ledger; nothing is modelled.
 */
export default async function SignalPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const session = await requireUser(`/consensus/${tokenId}`);
  const [ent, whale, ledger] = await Promise.all([
    getEntitlements(session.user.id),
    getWhaleWatch(),
    db.signal.findUnique({ where: { tokenId }, select: { firstSeenAt: true, entryPrice: true, entryHolders: true, entryKind: true, status: true } }),
  ]);
  keepScanFresh(whale?.ageMs);
  keepAlertsFlowing();
  trackUsage("signal.view", session.user.id);

  const back = (
    <Link href="/consensus" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden="true" /> All signals
    </Link>
  );
  // Free members can open the signals the free preview showed them; every other deep dive is Pro.
  const freePreview = !ent.limits.scanner && whale ? freePreviewTokens(whale.payload.holdings, CONSENSUS_MIN_WALLETS).has(tokenId) : false;
  if (!ent.limits.scanner && !freePreview) {
    return (
      <div className="space-y-6">
        {back}
        <UpgradeGate locked feature="Signal deep dives from Polymarket's top 1,000 traders" requiredTier="pro">
          <span />
        </UpgradeGate>
        <p className="text-xs text-muted-foreground">
          The three biggest signals are open on every plan.{" "}
          <Link href="/consensus" className="font-medium text-primary hover:underline">
            See them on Signals
          </Link>
        </p>
      </div>
    );
  }

  const p = whale?.payload;
  const h = p?.holdings.find((x) => x.tokenId === tokenId);
  if (!h) {
    if (!ledger) notFound();
    return (
      <div className="space-y-6">
        {back}
        <Section>
          <EmptyState
            icon={<ScrollText />}
            title="This signal is no longer live"
            description={`Fewer than two of the top traders hold this side now. It stays on the public record, called at ${Math.round(ledger.entryPrice * 100)}¢ on ${dateShort(ledger.firstSeenAt)}.`}
            action={<Link href="/track-record" className="text-sm font-medium text-primary hover:underline">See the track record →</Link>}
          />
        </Section>
      </div>
    );
  }

  const read = readConsensus(h);
  const holders = h.topHolders ?? [];
  const walletBy = new Map((p!.wallets ?? []).map((w) => [w.wallet.toLowerCase(), w]));
  const otherSides = p!.holdings.filter((x) => x.conditionId === h.conditionId && x.tokenId !== h.tokenId).sort((a, b) => b.holders - a.holders);
  const rival = otherSides[0];
  const moves = p!.recentMoves.filter((m) => (h.marketSlug && m.marketSlug ? m.marketSlug === h.marketSlug : m.title === h.title)).slice(0, 12);
  const clusters = (p!.clusters ?? []).filter((c) => c.tokenId === h.tokenId);
  const points = holders.filter((x) => x.entryAt).map((x) => ({ name: x.name, rank: x.rank, value: x.value, t: Date.parse(x.entryAt!) }));
  const live = isInPlay(h);
  const end = fmtDate(h.endDate);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <ScanFreshness generatedAt={p!.generatedAt} note={`${p!.tradersScanned.toLocaleString("en-US")} traders`} />
      </div>
      {freePreview && (
        <p className="-mt-6 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-xs text-muted-foreground">
          One of your free signals: the three biggest are open on every plan.{" "}
          <Link href="/pricing" className="font-medium text-primary hover:underline">
            Pro opens every signal and sends alerts when top traders move
          </Link>
          .
        </p>
      )}

      {/* Hero: the claim, its size, and the one action */}
      <section className="card-surface hero-glow relative overflow-hidden p-6 sm:p-8">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {h.category}
            {end ? ` · ends ${end}` : ""}
          </span>
          <SignalBadge h={h} />
        </div>
        <div className="relative mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12">
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-semibold leading-tight sm:text-4xl">{h.title}</h1>
            <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3">
              <span className="flex items-baseline gap-2">
                <span className="figure text-6xl font-semibold leading-none">{h.holders}</span>
                <span className="text-base text-muted-foreground">of the top 1,000 traders bet</span>
              </span>
              <SidePill outcome={h.outcome} size="lg" />
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{read.detail}</p>
            {ledger && (
              <Link href="/track-record" className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs transition-colors hover:border-foreground/30">
                <ScrollText className="size-3.5 text-brand-cyan" aria-hidden="true" />
                <span>
                  On the public record since <span className="font-medium text-foreground">{dateShort(ledger.firstSeenAt)}</span>, called at{" "}
                  <span className="tabular font-medium text-foreground">{Math.round(ledger.entryPrice * 100)}¢</span>
                  {ledger.status !== "open" ? ` · ${ledger.status}` : ""}
                </span>
              </Link>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Fact label="Invested" value={`$${compact(h.totalValue)}`} sub="on this side" />
              <Fact label="Biggest holder" value={h.topHolderShare !== undefined ? `${Math.round(h.topHolderShare * 100)}%` : "—"} sub="of the money" />
              <Fact label="New this week" value={h.recentEntrants ?? "—"} sub={`of ${h.holders} traders`} />
              <Fact label="Holding since" value={h.firstEntry ? dateShort(h.firstEntry) : "—"} sub={h.firstEntry ? `first buy, ${Math.round(ageMs(h.firstEntry) / DAY_MS)} days ago` : undefined} />
            </div>
            <PriceTrack entry={h.avgEntry} now={h.currentPrice} />
            <OpenOnPolymarket title={h.title} outcome={h.outcome} usEvent={h.usEvent} inPlay={live} />
          </div>
        </div>
      </section>

      {/* The two pictures that a holder count hides: concentration and timing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Who owns this side" description="Each top holder's share of the money; everyone else pooled">
          {holders.length ? <OwnershipBar holders={holders} total={h.totalValue} holderCount={h.holders} /> : <p className="text-sm text-muted-foreground">Holder detail is not in this scan.</p>}
        </Section>
        <Section title="When they got in" description="First purchase date vs. position size today, one dot per trader">
          <EntryTimeline points={points} />
        </Section>
      </div>

      {rival && (
        <Section
          title="The other side"
          description="Top traders betting against this one"
          right={
            <Link href={`/consensus/${rival.tokenId}`} className="text-xs font-medium text-primary hover:underline">
              Open {rival.outcome} →
            </Link>
          }
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="flex items-center gap-2">
              <SidePill outcome={rival.outcome} />
              <span className="figure text-2xl font-semibold">{rival.holders}</span>
              <span className="text-sm text-muted-foreground">traders · ${compact(rival.totalValue)} invested · now {Math.round(rival.currentPrice * 100)}¢</span>
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{explainSplit(h.holders >= rival.holders ? h : rival, h.holders >= rival.holders ? rival : h)}</p>
        </Section>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <Section title="Every top holder" description={`The ${Math.min(holders.length, h.holders)} biggest positions on this side, with their all-time record`} className="xl:col-span-3">
          {holders.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="label-micro px-1 py-2 font-medium">Trader</th>
                    <th scope="col" className="label-micro px-1 py-2 text-right font-medium">Position</th>
                    <th scope="col" className="label-micro px-1 py-2 text-right font-medium">All-time profit</th>
                    <th scope="col" className="label-micro px-1 py-2 text-right font-medium">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {[...holders]
                    .sort((a, b) => b.value - a.value)
                    .map((x) => {
                      const w = walletBy.get(x.wallet.toLowerCase());
                      return (
                        <tr key={x.wallet} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                          <td className="px-1 py-2.5">
                            <Link href={walletHref(x.wallet)} className="group flex min-w-0 items-center gap-2.5">
                              <TraderAvatar wallet={x.wallet} name={x.name} size={26} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium group-hover:text-primary">{x.name}</span>
                                <span className="tabular block font-mono text-[11px] text-muted-foreground">#{x.rank} all-time</span>
                              </span>
                            </Link>
                          </td>
                          <td className="tabular px-1 py-2.5 text-right font-semibold">${compact(x.value)}</td>
                          <td className="tabular px-1 py-2.5 text-right text-muted-foreground">{w ? `$${compact(w.pnl)}` : "—"}</td>
                          <td className="whitespace-nowrap px-1 py-2.5 text-right text-xs text-muted-foreground">{x.entryAt ? new Date(x.entryAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Holder detail is not in this scan.</p>
          )}
        </Section>

        <div className="space-y-4 xl:col-span-2">
          {clusters.length > 0 && (
            <Section title="Moving together" description="Top traders who bought this side within 72 hours of each other">
              {clusters.map((c) => (
                <div key={c.firstIso} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Users className="size-4 text-brand-cyan" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{c.wallets.length} traders</span> <span className="text-muted-foreground">· ${compact(c.totalUsd)}</span>
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">latest {relative(c.lastIso)}</span>
                </div>
              ))}
            </Section>
          )}
          <Section title="Latest trades in this market" description="Big trades by the top 100 traders, both sides">
            {moves.length ? (
              <div className="-my-3 divide-y divide-border/70">
                {moves.map((m, i) => (
                  <TradeRow key={`${m.txHash ?? m.tsIso}-${i}`} m={m} fresh={ageMs(m.tsIso) < DAY_MS / 4} showTx />
                ))}
              </div>
            ) : (
              <EmptyState icon={<CalendarClock />} title="No big trades lately" description="None of the top 100 traders made a $300+ trade in this market in the last 10 days." />
            )}
          </Section>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        {read.label === "Whale-led" ? <Crown className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
        <span>
          {kindLabel(read.label)}. A trader counts toward a side only when at least 60% of their money in this market is on it; {h.hedged ? `${h.hedged} trader${h.hedged === 1 ? " is" : "s are"} betting both sides and not counted. ` : ""}
          Agreement between strong traders is a starting point for your own research, not a tip to copy. EDGEWISE does not place or hold bets.
        </span>
      </p>
    </div>
  );
}
