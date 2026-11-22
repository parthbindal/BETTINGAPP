import Link from "next/link";
import { Radar } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { runScanner, SIGNAL_LABELS, type ScanFilters, type ScanSignal } from "@/lib/scanner";
import { getCategoryCounts } from "@/lib/data/markets";
import { ensureMarketsFresh } from "@/lib/data/market-freshness";
import { SPORTS } from "@/lib/data/sports";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { ConfidenceBadge, UpgradeGate } from "@/components/shared/badges";
import { pct, pts, relative, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const inputClass = "h-8 rounded-lg border border-input bg-surface-2/40 px-2.5 text-sm";

export default async function ScannerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireUser("/scanner");
  const ent = await getEntitlements(session.user.id);

  if (!ent.limits.scanner) {
    return (
      <div className="space-y-5">
        <PageHeader title="Opportunity Scanner" description="Finds analytical situations worth researching across markets and projections." />
        <UpgradeGate locked feature="Opportunity Scanner" requiredTier="pro">
          <span />
        </UpgradeGate>
        <Section title="What the scanner looks for">
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {Object.values(SIGNAL_LABELS).map((l) => (
              <li key={l} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" /> {l}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Every result carries its confidence, data freshness, an explanation and the main risks. Differences are shown net of approximate fees. Nothing is labeled a winning opportunity.</p>
        </Section>
      </div>
    );
  }

  await ensureMarketsFresh().catch(() => {});
  const advanced = ent.limits.scannerAdvancedFilters;
  const signal = sp.signal && sp.signal in SIGNAL_LABELS ? (sp.signal as ScanSignal) : undefined;
  const minConfidence = sp.confidence === "low" || sp.confidence === "high" ? sp.confidence : "medium";
  const filters: ScanFilters = {
    category: sp.category || undefined,
    signal,
    minConfidence,
    sport: advanced ? sp.sport || undefined : undefined,
    maxDays: advanced && sp.days ? Number(sp.days) || undefined : undefined,
    minDiffPts: advanced && sp.minDiff ? Number(sp.minDiff) || undefined : undefined,
  };
  const [{ results, scanned, projectionsScanned, generatedAt }, cats] = await Promise.all([runScanner(ent.limits, filters), getCategoryCounts()]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = q ? results.filter((r) => `${r.title} ${r.subtitle ?? ""} ${r.category}`.toLowerCase().includes(q)) : results;
  trackUsage("scanner.run", session.user.id, { results: results.length });

  return (
    <div className="space-y-5">
      <PageHeader title="Opportunity Scanner" description="Situations worth researching: model-versus-market gaps net of fees, significant moves, closing-soon markets, projection gaps and data-quality warnings. A probability difference is a research prompt, not a profitable opportunity." />

      <form action="/scanner" method="get" className="card-surface flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs text-muted-foreground">
          Search
          <input name="q" defaultValue={sp.q} placeholder="Filter results" className={cn(inputClass, "mt-1 block w-44")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Category
          <select name="category" defaultValue={sp.category ?? ""} className={cn(inputClass, "mt-1 block")}>
            <option value="">All</option>
            {cats.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Signal
          <select name="signal" defaultValue={sp.signal ?? ""} className={cn(inputClass, "mt-1 block")}>
            <option value="">All</option>
            {Object.entries(SIGNAL_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Minimum confidence
          <select name="confidence" defaultValue={minConfidence} className={cn(inputClass, "mt-1 block")}>
            <option value="low">Low and above</option>
            <option value="medium">Medium and above</option>
            <option value="high">High only</option>
          </select>
        </label>
        {advanced ? (
          <>
            <label className="text-xs text-muted-foreground">
              Sport
              <select name="sport" defaultValue={sp.sport ?? ""} className={cn(inputClass, "mt-1 block")}>
                <option value="">All</option>
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Closes within (days)
              <input name="days" type="number" min={1} max={365} defaultValue={sp.days} className={cn(inputClass, "mt-1 block w-24")} />
            </label>
            <label className="text-xs text-muted-foreground">
              Min. difference (pts)
              <input name="minDiff" type="number" min={1} max={50} defaultValue={sp.minDiff} className={cn(inputClass, "mt-1 block w-24")} />
            </label>
          </>
        ) : (
          <Link href="/pricing" className="pb-1.5 text-xs text-primary hover:underline">
            Sport, date and difference filters with Pro →
          </Link>
        )}
        <button className="h-8 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85">Scan</button>
      </form>

      <p className="text-xs text-muted-foreground">
        Scanned {scanned} liquid markets and {projectionsScanned} projection lines {relative(generatedAt)}. Showing {shown.length} situation{shown.length === 1 ? "" : "s"}. Quiet scans are normal: liquid markets are usually priced efficiently.
      </p>

      {shown.length ? (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Event or market</th>
                <th className="tabular px-3 py-2.5 text-right font-medium">Current</th>
                <th className="tabular px-3 py-2.5 text-right font-medium">Estimate</th>
                <th className="tabular px-3 py-2.5 text-right font-medium">Difference</th>
                <th className="px-3 py-2.5 font-medium">Confidence</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Data</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Closes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={r.href} className="font-medium hover:text-primary">
                      {r.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {r.subtitle && <span>{r.subtitle}</span>}
                      <span>{r.category}</span>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">{SIGNAL_LABELS[r.signal]}</span>
                      
                    </div>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-primary">Explanation and key risks</summary>
                      <p className="mt-1.5 text-muted-foreground">{r.explanation}</p>
                      {r.risks.length > 0 && (
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-status-warning/90">
                          {r.risks.map((k) => (
                            <li key={k}>{k}</li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{r.kind === "projection" ? "line" : pct(r.current, 0)}</td>
                  <td className="tabular px-3 py-3 text-right">{r.estimate !== null ? pct(r.estimate, 0) : "—"}</td>
                  <td className={cn("tabular px-3 py-3 text-right", r.diffPts !== null && (r.diffPts > 0 ? "text-status-good" : "text-status-critical"))}>{r.diffPts !== null ? pts(r.diffPts, 0) : "—"}</td>
                  <td className="px-3 py-3">
                    <ConfidenceBadge level={r.confidence} />
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">
                    {titleCase(r.freshness)}
                    <div className="text-[11px]">{relative(r.fetchedAt)}</div>
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">{relative(r.closeTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Radar />} title="Nothing notable right now" description="No situations passed your filters. Efficient markets often look like this. Try lowering the confidence filter or widening the categories." />
      )}
      <p className="text-[11px] text-muted-foreground">Estimates are heuristic and can be wrong. Account for fees, spreads, liquidity and model error. Past patterns do not guarantee future results.</p>
    </div>
  );
}
