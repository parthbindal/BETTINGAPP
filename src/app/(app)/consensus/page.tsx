import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, type ConsensusHolding } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateShort, relative } from "@/lib/format";
import { ageMs, polymarketEventUrl, readConsensus, type ConsensusTone } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

const MIN_OPTIONS = [5, 10, 15, 20] as const;
const DETECTED = [
  { key: "any", label: "Any time", days: null },
  { key: "7d", label: "New entries, 7d", days: 7 },
  { key: "30d", label: "New entries, 30d", days: 30 },
] as const;
const READS = ["Converging now", "Broad", "Long-held", "Whale-led"] as const;

type Params = { min?: string; cat?: string; dir?: string; when?: string; read?: string };

const toneClass: Record<ConsensusTone, string> = {
  primary: "border-primary/45 bg-primary/12 text-foreground",
  warning: "border-status-warning/45 bg-status-warning/10 text-status-warning",
  neutral: "border-border bg-surface-2 text-foreground/85",
};

function direction(h: ConsensusHolding): "yes" | "no" | "named" {
  const o = h.outcome.toLowerCase();
  return o === "yes" ? "yes" : o === "no" ? "no" : "named";
}

function FilterLink({ params, patch, active, children }: { params: Params; patch: Partial<Params>; active: boolean; children: React.ReactNode }) {
  const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as Array<[string, string]>);
  return (
    <Link
      href={`/consensus?${next}`}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", active ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

function ConsensusCard({ h }: { h: ConsensusHolding }) {
  const read = readConsensus(h);
  const holders = h.topHolders ?? [];
  return (
    <article className="card-surface flex flex-col p-5 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">Smart money consensus</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass[read.tone])}>{read.label}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug">
        {h.slug ? (
          <a href={polymarketEventUrl(h.slug)} target="_blank" rel="noreferrer" className="hover:text-primary">
            {h.title} <ArrowUpRight className="inline size-3.5 opacity-60" aria-hidden="true" />
          </a>
        ) : (
          h.title
        )}
      </h3>
      <div className="mt-1 text-xs text-muted-foreground">{h.category}{h.endDate ? ` · ends ${dateShort(h.endDate)}` : ""}</div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
        <div className="bg-surface-1 px-2 py-2.5">
          <div className="tabular text-xl font-semibold">{h.holders}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">wallets · {(h.pctOfField * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-surface-1 px-2 py-2.5">
          <div className="truncate text-xl font-semibold">{h.outcome}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">position</div>
        </div>
        <div className="bg-surface-1 px-2 py-2.5">
          <div className="tabular text-xl font-semibold">${compact(h.totalValue)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">combined</div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Avg entry → now</dt>
        <dd className="tabular text-right">{Math.round(h.avgEntry * 100)}¢ → {Math.round(h.currentPrice * 100)}¢</dd>
        <dt className="text-muted-foreground">First entered</dt>
        <dd className="text-right">{h.firstEntry ? dateShort(h.firstEntry) : "—"}</dd>
        <dt className="text-muted-foreground">Most recent entry</dt>
        <dd className="text-right">{h.lastEntry ? relative(h.lastEntry) : "—"}</dd>
        <dt className="text-muted-foreground">Largest holder</dt>
        <dd className="tabular text-right">{h.topHolderShare !== undefined ? `${Math.round(h.topHolderShare * 100)}% of money` : "—"}</dd>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{read.detail}{h.hedged ? ` ${h.hedged} hedged wallet${h.hedged === 1 ? "" : "s"} excluded.` : ""}</p>

      {holders.length > 0 && (
        <details className="group mt-4 border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground hover:text-foreground">
            <span className="flex -space-x-1.5">
              {holders.slice(0, 6).map((t) => (
                <TraderAvatar key={t.wallet} wallet={t.wallet} name={t.name} size={22} className="ring-2 ring-card" />
              ))}
            </span>
            <span>Wallets involved <span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {holders.slice(0, 12).map((t) => (
              <li key={t.wallet} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/wallets/${t.wallet}`} className="flex min-w-0 items-center gap-2 hover:text-primary">
                  <TraderAvatar wallet={t.wallet} name={t.name} size={18} />
                  <span className="truncate">{t.rank ? `#${t.rank} ` : ""}{t.name}</span>
                </Link>
                <span className="tabular shrink-0 text-muted-foreground">${compact(t.value)}{t.entryAt ? ` · ${dateShort(t.entryAt)}` : ""}</span>
              </li>
            ))}
            {holders.length > 12 && <li className="text-[11px] text-muted-foreground">+{holders.length - 12} more of the top holders</li>}
          </ul>
        </details>
      )}
    </article>
  );
}

export default async function ConsensusPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireUser("/consensus");
  const [ent, whale, sp] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), searchParams]);
  trackUsage("consensus.view", session.user.id);
  const pro = ent.limits.scanner;

  const header = (
    <PageHeader
      eyebrow="Smart money"
      title="Consensus Trades"
      description="Outcomes that several of Polymarket's most profitable wallets hold at the same time, with who holds them, when they entered and how concentrated the money is."
      actions={pro ? <WhaleRefreshButton /> : undefined}
    />
  );
  if (!pro) {
    return (
      <div className="space-y-6">
        {header}
        <UpgradeGate locked feature="Consensus detection across Polymarket's top 1,000 wallets" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  }
  if (!whale) {
    return (
      <div className="space-y-6">
        {header}
        <Section><EmptyState title="No scan yet" description="Consensus appears after the first scan of Polymarket's top wallets." action={<WhaleRefreshButton />} /></Section>
      </div>
    );
  }

  const params: Params = { min: sp.min, cat: sp.cat, dir: sp.dir, when: sp.when, read: sp.read };
  const min = MIN_OPTIONS.find((m) => String(m) === sp.min) ?? 10;
  const when = DETECTED.find((d) => d.key === sp.when) ?? DETECTED[0];
  const all = whale.payload.holdings;
  const categories = [...new Set(all.map((h) => h.category))].sort();
  const list = all
    .filter((h) => h.holders >= min)
    .filter((h) => !sp.cat || h.category === sp.cat)
    .filter((h) => !sp.dir || direction(h) === sp.dir)
    .filter((h) => !when.days || (h.lastEntry !== null && h.lastEntry !== undefined && ageMs(h.lastEntry) <= when.days * 86_400_000))
    .filter((h) => !sp.read || readConsensus(h).label === sp.read)
    .sort((a, b) => b.holders - a.holders || b.totalValue - a.totalValue);

  return (
    <div className="space-y-6">
      {header}
      <ScanFreshness generatedAt={whale.payload.generatedAt} note={`${whale.payload.tradersScanned.toLocaleString("en-US")} wallets`} />

      <Section>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 text-xs text-muted-foreground">Min. wallets</span>
            {MIN_OPTIONS.map((m) => <FilterLink key={m} params={params} patch={{ min: String(m) }} active={m === min}>{m}+</FilterLink>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 text-xs text-muted-foreground">Category</span>
            <FilterLink params={params} patch={{ cat: "" }} active={!sp.cat}>All</FilterLink>
            {categories.map((c) => <FilterLink key={c} params={params} patch={{ cat: c }} active={sp.cat === c}>{c}</FilterLink>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 text-xs text-muted-foreground">Position</span>
            {[["", "All"], ["yes", "Yes"], ["no", "No"], ["named", "Named outcome"]].map(([k, l]) => <FilterLink key={k} params={params} patch={{ dir: k }} active={(sp.dir ?? "") === k}>{l}</FilterLink>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 text-xs text-muted-foreground">Detected</span>
            {DETECTED.map((d) => <FilterLink key={d.key} params={params} patch={{ when: d.key === "any" ? "" : d.key }} active={when.key === d.key}>{d.label}</FilterLink>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 text-xs text-muted-foreground">Read</span>
            <FilterLink params={params} patch={{ read: "" }} active={!sp.read}>All</FilterLink>
            {READS.map((r) => <FilterLink key={r} params={params} patch={{ read: r }} active={sp.read === r}>{r}</FilterLink>)}
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            A wallet counts toward an outcome only if at least 60% of its money in that market sits on that side; evenly hedged wallets are excluded. The read uses real entry times and position sizes: <b className="text-foreground/90">Converging now</b> means many wallets entered in the last week, <b className="text-foreground/90">Long-held</b> means entries span a month or more, <b className="text-foreground/90">Whale-led</b> means one wallet holds most of the money. Agreement is a research prompt, not a signal to copy.
          </p>
        </div>
      </Section>

      <div className="tabular text-xs text-muted-foreground">{list.length} outcome{list.length === 1 ? "" : "s"} match{list.length > 60 ? " · showing the 60 most-held; raise the minimum to narrow" : ""}</div>
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, 60).map((h) => <ConsensusCard key={h.tokenId} h={h} />)}
        </div>
      ) : (
        <Section><EmptyState title="Nothing matches these filters" description="Lower the minimum wallet count or clear a filter." action={<Link href="/consensus" className="text-sm text-primary hover:underline">Clear filters</Link>} /></Section>
      )}
    </div>
  );
}
