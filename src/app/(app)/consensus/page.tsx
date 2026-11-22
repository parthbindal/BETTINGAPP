import Link from "next/link";
import { MoneyMap } from "@/components/intel/money-map";
import { Filter } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { keepScanFresh, getWhaleWatch, type ConsensusHolding } from "@/lib/whales";
import { Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { SIGNAL_KINDS, SignalCard, SplitCard, signalKind, type SignalKind } from "@/components/intel/signal";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateShort } from "@/lib/format";
import { isInPlay, readConsensus, splitSides, walletHref } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const MIN_OPTIONS = [5, 10, 15, 20] as const;
const PAGE = 48;

type Params = { min?: string; cat?: string; dir?: string; kind?: string; settled?: string };

function side(h: ConsensusHolding): "yes" | "no" | "named" {
  const o = h.outcome.toLowerCase();
  return o === "yes" ? "yes" : o === "no" ? "no" : "named";
}

function href(params: Params, patch: Partial<Params>) {
  const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as Array<[string, string]>);
  const q = next.toString();
  return q ? `/consensus?${q}` : "/consensus";
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Everyone in the bet, behind a disclosure so the card stays scannable. */
function WhoIsIn({ h }: { h: ConsensusHolding }) {
  const holders = h.topHolders ?? [];
  if (!holders.length) return null;
  return (
    <details className="group mt-3 border-t border-border/70 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>See which traders</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="mt-2.5 space-y-2">
        {holders.slice(0, 10).map((t) => (
          <li key={t.wallet} className="flex items-center justify-between gap-2 text-xs">
            <Link href={walletHref(t.wallet)} className="flex min-w-0 items-center gap-2 hover:text-primary">
              <TraderAvatar wallet={t.wallet} name={t.name} size={20} />
              <span className="truncate">{t.name}</span>
              <span className="tabular shrink-0 text-muted-foreground">#{t.rank}</span>
            </Link>
            <span className="tabular shrink-0 text-muted-foreground">
              ${compact(t.value)}
              {t.entryAt ? ` · in since ${dateShort(t.entryAt)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {readConsensus(h).detail}
        {h.hedged ? ` ${h.hedged} trader${h.hedged === 1 ? "" : "s"} betting both sides ${h.hedged === 1 ? "is" : "are"} not counted.` : ""}
      </p>
    </details>
  );
}


export default async function ConsensusPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireUser("/consensus");
  const [ent, whale, sp] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), searchParams]);
  keepScanFresh(whale?.ageMs);
  trackUsage("consensus.view", session.user.id);
  const pro = ent.limits.scanner;

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Signals</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">When many of Polymarket&apos;s most profitable traders put money on the same side of a market, it shows up here.</p>
      </div>
      {pro && <WhaleRefreshButton />}
    </div>
  );
  if (!pro) {
    return (
      <div className="space-y-6">
        {header}
        <UpgradeGate locked feature="Signals from Polymarket's top 1,000 traders" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  }
  if (!whale) {
    return (
      <div className="space-y-6">
        {header}
        <Section>
          <EmptyState title="Getting the first scan ready" description="Signals appear after the first scan of Polymarket's top traders." action={<WhaleRefreshButton />} />
        </Section>
      </div>
    );
  }

  const params: Params = { min: sp.min, cat: sp.cat, dir: sp.dir, kind: sp.kind, settled: sp.settled };
  const min = MIN_OPTIONS.find((m) => String(m) === sp.min) ?? 10;
  const showSettled = sp.settled === "1";
  const base = whale.payload.holdings.filter((h) => h.holders >= min).filter((h) => showSettled || isInPlay(h));
  const categories = [...new Set(base.map((h) => h.category))].sort();
  const kindCounts = Object.fromEntries(SIGNAL_KINDS.map((k) => [k.key, base.filter((h) => signalKind(h) === k.key).length])) as Record<SignalKind, number>;
  const list = base
    .filter((h) => !sp.cat || h.category === sp.cat)
    .filter((h) => !sp.dir || side(h) === sp.dir)
    .filter((h) => !sp.kind || signalKind(h) === sp.kind)
    .sort((a, b) => b.totalValue - a.totalValue || b.holders - a.holders); // dollars at risk first: that is the product
  const settledCount = whale.payload.holdings.filter((h) => h.holders >= min && !isInPlay(h)).length;

  // A market with top traders on both sides renders once, as a split card, at its busiest side's place.
  const splits = splitSides(base, min);
  const items: Array<{ kind: "one"; h: ConsensusHolding } | { kind: "split"; sides: ConsensusHolding[] }> = [];
  const seen = new Set<string>();
  for (const h of list) {
    const sides = splits.get(h.conditionId);
    if (!sides) items.push({ kind: "one", h });
    else if (!seen.has(h.conditionId)) {
      seen.add(h.conditionId);
      items.push({ kind: "split", sides });
    }
  }

  const firstOne = items.find((it) => it.kind === "one");
  // The map: one tile per market (the side more top traders are on), live markets only, biggest money first.
  const seenMarket = new Set<string>();
  const mapSignals: ConsensusHolding[] = [];
  for (const h of [...list].sort((a, b) => b.holders - a.holders)) {
    if (!isInPlay(h) || seenMarket.has(h.conditionId)) continue;
    seenMarket.add(h.conditionId);
    mapSignals.push(h);
  }
  mapSignals.sort((a, b) => b.totalValue - a.totalValue);
  const hiddenActive = [sp.dir, sp.kind, sp.min, sp.settled].filter(Boolean).length;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        {header}
        <ScanFreshness generatedAt={whale.payload.generatedAt} note={`${whale.payload.tradersScanned.toLocaleString("en-US")} traders`} />
      </div>

      {mapSignals.length >= 3 && (
        <Section title="The smart money map" description="Every live signal, sized by the money behind it and coloured by how it has moved since the traders bought. Tap a tile to open it.">
          <MoneyMap signals={mapSignals.slice(0, 36)} />
        </Section>
      )}

      {/* Two visible controls: topic, and everything else behind "More filters". */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-1" role="navigation" aria-label="Topic">
            <Chip to={href(params, { cat: "" })} active={!sp.cat}>All topics</Chip>
            {categories.map((c) => (
              <Chip key={c} to={href(params, { cat: c })} active={sp.cat === c}>{c}</Chip>
            ))}
          </div>
        </div>
        <details className="group rounded-xl border border-border bg-surface-1" open={hiddenActive > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              More filters{hiddenActive > 0 ? <span className="tabular ml-1.5 rounded-full bg-surface-3 px-1.5 py-0.5 text-xs">{hiddenActive}</span> : null}
            </span>
            <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="space-y-4 border-t border-border px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Type</span>
              <Chip to={href(params, { kind: "" })} active={!sp.kind}>Any · {base.length}</Chip>
              {SIGNAL_KINDS.map((k) => (
                <Chip key={k.key} to={href(params, { kind: k.key })} active={sp.kind === k.key}>
                  <span className="inline-flex items-center gap-1.5">
                    <k.icon className="size-3.5" aria-hidden="true" /> {k.label} · {kindCounts[k.key]}
                  </span>
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Side</span>
              {[["", "Any"], ["yes", "Yes"], ["no", "No"], ["named", "Team / name"]].map(([k, l]) => (
                <Chip key={k} to={href(params, { dir: k })} active={(sp.dir ?? "") === k}>{l}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">At least</span>
              {MIN_OPTIONS.map((m) => (
                <Chip key={m} to={href(params, { min: m === 10 ? "" : String(m) })} active={m === min}>{m} traders</Chip>
              ))}
            </div>
            {settledCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Decided</span>
                <Chip to={href(params, { settled: "" })} active={!showSettled}>Hide</Chip>
                <Chip to={href(params, { settled: "1" })} active={showSettled}>Show {settledCount}</Chip>
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-4 text-xs sm:grid-cols-2">
              {SIGNAL_KINDS.map((k) => (
                <div key={k.key} className="flex gap-2">
                  <dt className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
                    <k.icon className="size-3.5 text-muted-foreground" aria-hidden="true" /> {k.label}:
                  </dt>
                  <dd className="text-muted-foreground">{k.meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      </div>

      <section>
        <p className="tabular mb-4 text-xs text-muted-foreground">
          {items.length} signal{items.length === 1 ? "" : "s"}, biggest money first
          {seen.size > 0 ? ` · ${seen.size} where top traders are split` : ""}
          {items.length > PAGE ? ` · showing the top ${PAGE}` : ""}
        </p>
        {items.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.slice(0, PAGE).map((it, i) =>
              it.kind === "one" ? (
                <SignalCard key={it.h.tokenId} id={`sig-${it.h.tokenId}`} href={`/consensus/${it.h.tokenId}`} h={it.h} rank={i + 1} tiered primaryCta={it === firstOne} className="scroll-mt-20 target:border-primary/60 target:ring-2 target:ring-primary/40" footer={<WhoIsIn h={it.h} />} />
              ) : (
                <SplitCard key={it.sides[0]!.conditionId} id={`sig-${it.sides[0]!.tokenId}`} href={`/consensus/${it.sides[0]!.tokenId}`} sides={it.sides} rank={i + 1} className="scroll-mt-20 target:border-primary/60 target:ring-2 target:ring-primary/40" />
              ),
            )}
          </div>
        ) : (
          <Section>
            <EmptyState icon={<Filter />} title="No signal fits these filters" description="Widen the topic or lower the trader count to see more." action={<Link href="/consensus" className="text-sm font-medium text-primary hover:underline">Clear filters</Link>} />
          </Section>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        A trader counts toward a side only when at least 60% of their money in that market is on it; traders betting both sides evenly are left out. Agreement between strong traders is a starting point for your own research, not a tip to copy.
      </p>
    </div>
  );
}
