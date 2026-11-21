import Link from "next/link";
import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { countReportsThisMonth } from "@/lib/ai/reports";
import { ensureDailyBrief } from "@/lib/briefs";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { ConfidenceBadge, DemoTag } from "@/components/shared/badges";
import { relative, pct, pts } from "@/lib/format";
import { Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";

export default async function ResearchPage() {
  const session = await requireUser("/research");
  const ent = await getEntitlements(session.user.id);
  const [reports, used, brief] = await Promise.all([
    db.researchReport.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    countReportsThisMonth(session.user.id),
    ensureDailyBrief().catch(() => null),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Research Center" description="Saved research reports and the daily market summary." actions={<LinkButton href="/research/new" size="sm"><Plus className="size-4" /> New report</LinkButton>} />
      {brief && (
        <Section title="Daily market research summary" description={`Generated ${relative(brief.generatedAt)} from cached Kalshi data · no model tokens used`}>
          <p className="text-sm font-medium">{brief.headline}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div><div className="mb-1 text-xs font-medium text-muted-foreground">Biggest moves</div><ul className="space-y-1 text-xs">{brief.movers.map((m) => <li key={m.ticker}><Link href={`/markets/${m.ticker}`} className="hover:text-primary">{m.title}{m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}</Link> <span className={m.delta > 0 ? "text-status-good" : "text-status-critical"}>{pts(m.delta, 0)}</span></li>)}</ul></div>
            <div><div className="mb-1 text-xs font-medium text-muted-foreground">Featured</div><ul className="space-y-1 text-xs">{brief.featured.map((m) => <li key={m.ticker}><Link href={`/markets/${m.ticker}`} className="hover:text-primary">{m.title}{m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}</Link> <span className="tabular text-muted-foreground">{pct(m.prob, 0)}</span></li>)}</ul></div>
            <div><div className="mb-1 text-xs font-medium text-muted-foreground">Closing soon</div><ul className="space-y-1 text-xs">{brief.closingSoon.map((m) => <li key={m.ticker}><Link href={`/markets/${m.ticker}`} className="hover:text-primary">{m.title}{m.yesSubTitle ? ` — ${m.yesSubTitle}` : ""}</Link> <span className="text-muted-foreground">{relative(m.closeTime)}</span></li>)}</ul></div>
          </div>
          <ul className="mt-3 text-[11px] text-muted-foreground">{brief.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Section>
      )}
      <Section title="Your reports" description={`${used} of ${ent.limits.reportsPerMonth} this month on your plan`}>
        {reports.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/research/${r.id}`} className="block rounded-lg border border-border/60 p-4 hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="capitalize">{r.subjectKind} · {r.modelVersion}</span>{r.isDemoData && <DemoTag />}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium">{r.title}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><ConfidenceBadge level={r.confidence as "low" | "medium" | "high"} /><span>{relative(r.createdAt)}</span></div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No reports yet" description="Generate one from any market or player page, or start here." action={<LinkButton href="/research/new" size="sm">New report</LinkButton>} />
        )}
      </Section>
    </div>
  );
}
