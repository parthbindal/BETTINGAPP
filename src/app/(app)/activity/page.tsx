import Link from "next/link";
import { Users } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateTime, relative } from "@/lib/format";
import { ageMs, polygonTxUrl, polymarketEventUrl } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

type Params = { side?: string; cat?: string; min?: string };
const SIZES = [300, 1_000, 10_000, 50_000] as const;
const DAY_MS = 86_400_000;

function Chip({ params, patch, active, children }: { params: Params; patch: Partial<Params>; active: boolean; children: React.ReactNode }) {
  const q = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as Array<[string, string]>);
  return (
    <Link href={`/activity?${q}`} scroll={false} aria-current={active ? "true" : undefined} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", active ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")}>
      {children}
    </Link>
  );
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireUser("/activity");
  const [ent, whale, sp] = await Promise.all([getEntitlements(session.user.id), getWhaleWatch(), searchParams]);
  trackUsage("activity.view", session.user.id);
  const pro = ent.limits.scanner;
  const header = <PageHeader eyebrow="Smart money" title="Activity Feed" description="What Polymarket's top traders have been buying and selling, including moments when several of them entered the same outcome." actions={pro ? <WhaleRefreshButton /> : undefined} />;

  if (!pro) return <div className="space-y-6">{header}<UpgradeGate locked feature="The smart-money activity feed" requiredTier="pro"><span /></UpgradeGate></div>;
  if (!whale) return <div className="space-y-6">{header}<Section><EmptyState title="No scan yet" description="Activity appears after the first scan." action={<WhaleRefreshButton />} /></Section></div>;

  const p = whale.payload;
  const params: Params = { side: sp.side, cat: sp.cat, min: sp.min };
  const min = SIZES.find((s) => String(s) === sp.min) ?? 300;
  const categories = [...new Set(p.recentMoves.map((m) => m.category))].sort();
  const moves = p.recentMoves
    .filter((m) => !sp.side || (sp.side === "buy" ? m.side === "BUY" : m.side === "SELL"))
    .filter((m) => !sp.cat || m.category === sp.cat)
    .filter((m) => m.usd >= min);
  const clusters = (p.clusters ?? []).filter((c) => !sp.cat || c.category === sp.cat).slice(0, 6);
  const oldest = p.recentMoves.at(-1)?.tsIso;

  return (
    <div className="space-y-6">
      {header}
      <ScanFreshness generatedAt={p.generatedAt} note={`top ${p.recentTraders ?? 60} traders · updates with each scan, not streamed live`} />

      {clusters.length > 0 && (
        <Section title="Multiple tracked wallets, same outcome" description="Two or more top traders buying the same side within 72 hours">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clusters.map((c) => {
              const hours = Math.max(1, Math.round((Date.parse(c.lastIso) - Date.parse(c.firstIso)) / 3_600_000));
              return (
                <div key={c.tokenId} className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-cyan">
                    <Users className="size-3.5" aria-hidden="true" /> {c.wallets.length} wallets · {hours}h
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-semibold">
                    Bought <span className="text-primary">{c.outcome}</span> ·{" "}
                    {c.eventSlug ? <a href={polymarketEventUrl(c.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-primary">{c.title}</a> : c.title}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex -space-x-1.5">
                      {c.wallets.slice(0, 7).map((w) => (
                        <Link key={w.wallet} href={`/wallets/${w.wallet}`} title={`#${w.rank} ${w.trader} · $${compact(w.usd)}`}>
                          <TraderAvatar wallet={w.wallet} name={w.trader} size={24} className="ring-2 ring-card" />
                        </Link>
                      ))}
                    </span>
                    <span className="tabular text-sm font-medium">${compact(c.totalUsd)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Latest {relative(c.lastIso)}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="All moves" description={oldest ? `Trades of $${compact(min)}+ since ${dateTime(oldest)}` : undefined}>
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[["", "All"], ["buy", "Buys"], ["sell", "Sells"]].map(([k, l]) => <Chip key={k} params={params} patch={{ side: k }} active={(sp.side ?? "") === k}>{l}</Chip>)}
            <span className="mx-1 w-px bg-border" aria-hidden="true" />
            {SIZES.map((s) => <Chip key={s} params={params} patch={{ min: String(s) }} active={s === min}>${compact(s)}+</Chip>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip params={params} patch={{ cat: "" }} active={!sp.cat}>All categories</Chip>
            {categories.map((c) => <Chip key={c} params={params} patch={{ cat: c }} active={sp.cat === c}>{c}</Chip>)}
          </div>
        </div>
        {moves.length ? (
          <ol className="-mx-1 divide-y divide-border">
            {moves.slice(0, 150).map((m, i) => {
              const fresh = ageMs(m.tsIso) < DAY_MS;
              return (
                <li key={`${m.txHash ?? m.tsIso}-${i}`} className="flex items-start gap-3 px-1 py-3">
                  <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", fresh ? "bg-primary shadow-[0_0_6px_var(--primary)]" : "bg-surface-3")} aria-label={fresh ? "New in the last 24 hours" : undefined} />
                  {m.wallet ? <TraderAvatar wallet={m.wallet} name={m.trader} size={30} /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      {m.wallet ? <Link href={`/wallets/${m.wallet}`} className="font-medium hover:text-primary">{m.trader}</Link> : <span className="font-medium">{m.trader}</span>}
                      <span className="text-muted-foreground"> #{m.rank} </span>
                      <span className={m.side === "BUY" ? "" : "text-chart-2"}>{m.side === "BUY" ? "bought" : "sold"}</span> <span className="font-medium">{m.outcome}</span> at {m.pricePct}¢
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.category} · {m.eventSlug ? <a href={polymarketEventUrl(m.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-foreground">{m.title}</a> : m.title}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-sm font-semibold">${compact(m.usd)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {relative(m.tsIso)}
                      {m.txHash && <> · <a href={polygonTxUrl(m.txHash)} target="_blank" rel="noreferrer" className="hover:text-foreground">tx</a></>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState title="No moves match" description="Lower the minimum size or clear a filter." />
        )}
      </Section>
    </div>
  );
}
