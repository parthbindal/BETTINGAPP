import Link from "next/link";
import { CircleDollarSign, LineChart, Users } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, type ConsensusHolding } from "@/lib/whales";
import { Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { SIGNAL_KINDS, SignalCard, signalKind, type SignalKind } from "@/components/intel/signal";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateShort } from "@/lib/format";
import { isInPlay, polymarketEventUrl, readConsensus, walletHref } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

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
        active ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
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
        <span>See who&apos;s in</span>
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
        {h.slug && (
          <>
            {" "}
            <a href={polymarketEventUrl(h.slug)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              View on Polymarket ↗
            </a>
          </>
        )}
      </p>
    </details>
  );
}

const STEPS = [
  { icon: Users, title: "Who agrees", body: "How many of the 1,000 most profitable traders hold the same side." },
  { icon: LineChart, title: "How it's going", body: "The average price they paid versus the price right now." },
  { icon: CircleDollarSign, title: "How much is riding", body: "The combined dollars those traders have on this side." },
];

export default async function ConsensusPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireUser("/consensus");
  const [ent, whale, sp] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), searchParams]);
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
    .sort((a, b) => b.holders - a.holders || b.totalValue - a.totalValue);
  const settledCount = whale.payload.holdings.filter((h) => h.holders >= min && !isInPlay(h)).length;

  return (
    <div className="space-y-6">
      {header}
      <ScanFreshness generatedAt={whale.payload.generatedAt} note={`${whale.payload.tradersScanned.toLocaleString("en-US")} top traders`} />

      {/* How to read a signal */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-border bg-surface-1 p-3.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <s.icon className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium">
                <span className="tabular text-muted-foreground">{i + 1}.</span> {s.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Signal type tabs with counts */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="navigation" aria-label="Signal type">
        <Chip to={href(params, { kind: "" })} active={!sp.kind}>
          All · {base.length}
        </Chip>
        {SIGNAL_KINDS.map((k) => (
          <Chip key={k.key} to={href(params, { kind: k.key })} active={sp.kind === k.key}>
            <span className="inline-flex items-center gap-1.5">
              <k.icon className="size-3.5" aria-hidden="true" /> {k.label} · {kindCounts[k.key]}
            </span>
          </Chip>
        ))}
      </div>

      {/* Refine */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs text-muted-foreground">Topic</span>
          <Chip to={href(params, { cat: "" })} active={!sp.cat}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} to={href(params, { cat: c })} active={sp.cat === c}>{c}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Side</span>
          {[["", "Any"], ["yes", "Yes"], ["no", "No"], ["named", "Team / name"]].map(([k, l]) => (
            <Chip key={k} to={href(params, { dir: k })} active={(sp.dir ?? "") === k}>{l}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">At least</span>
          {MIN_OPTIONS.map((m) => (
            <Chip key={m} to={href(params, { min: m === 10 ? "" : String(m) })} active={m === min}>{m} traders</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">
          {list.length} signal{list.length === 1 ? "" : "s"}
          {list.length > PAGE ? `, showing the ${PAGE} with the most traders` : ""}
        </span>
        {settledCount > 0 && (
          <Link href={href(params, { settled: showSettled ? "" : "1" })} scroll={false} className="font-medium text-primary hover:underline">
            {showSettled ? "Hide decided markets" : `Show ${settledCount} decided market${settledCount === 1 ? "" : "s"}`}
          </Link>
        )}
      </div>

      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, PAGE).map((h, i) => (
            <SignalCard key={h.tokenId} id={`sig-${h.tokenId}`} h={h} rank={i + 1} className="scroll-mt-20 target:border-primary/60 target:ring-2 target:ring-primary/40" footer={<WhoIsIn h={h} />} />
          ))}
        </div>
      ) : (
        <Section>
          <EmptyState title="Nothing matches these filters" description="Try fewer traders, another topic, or clear the filters." action={<Link href="/consensus" className="text-sm font-medium text-primary hover:underline">Clear filters</Link>} />
        </Section>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A trader counts toward a side only when at least 60% of their money in that market is on it; traders betting both sides evenly are left out. Agreement between strong traders is a starting point for your own research, not a tip to copy.
      </p>
    </div>
  );
}
