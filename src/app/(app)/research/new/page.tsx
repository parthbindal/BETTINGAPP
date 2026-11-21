import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getFeaturedMarkets } from "@/lib/data/markets";
import { db } from "@/lib/db";
import { PageHeader, Section } from "@/components/shared/page-header";
import { ReportButton } from "@/components/shared/report-button";
import { statLabel } from "@/lib/data/sports";

export default async function NewReportPage() {
  await requireUser("/research/new");
  const [featured, projections] = await Promise.all([
    getFeaturedMarkets(8),
    db.projection.findMany({ where: { game: { status: "scheduled" } }, include: { player: true }, take: 8, orderBy: { fetchedAt: "desc" } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="New research report" description="Pick a subject. Reports include an executive summary, statistics, historical comparison, probability analysis, evidence, counterarguments, catalysts, risks, data quality, confidence and sources." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Prediction markets" description="Featured liquid markets; or open any market page and click Generate report">
          <ul className="space-y-2">{featured.map((m) => <li key={m.ticker} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"><Link href={`/markets/${m.ticker}`} className="truncate hover:text-primary">{m.title}{m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}</Link><ReportButton subjectKind="market" subjectRef={m.ticker} label="Report" /></li>)}</ul>
        </Section>
        <Section title="Player projections" description="Recent projection lines">
          <ul className="space-y-2">{projections.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"><Link href={`/sports/players/${p.playerId}?stat=${p.stat}&line=${p.line}`} className="truncate hover:text-primary">{p.player.name} · {statLabel(p.player.sport, p.stat)} {p.line}</Link><ReportButton subjectKind="player" subjectRef={p.playerId} stat={p.stat} line={p.line} label="Report" /></li>)}</ul>
        </Section>
      </div>
    </div>
  );
}
