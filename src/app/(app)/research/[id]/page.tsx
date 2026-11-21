import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { ReportView } from "@/components/research/report-view";
import type { Report } from "@/lib/ai/reports";
import { dateTime } from "@/lib/format";
import { ActionButton } from "@/components/shared/action-button";
import { Trash2 } from "lucide-react";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/research/${id}`);
  const r = await db.researchReport.findFirst({ where: { id, userId: session.user.id } });
  if (!r) notFound();
  const report = r.content as unknown as Report;
  const subjectHref = r.subjectKind === "market" ? `/markets/${r.subjectRef}` : `/sports/players/${r.subjectRef}`;
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/research" className="hover:text-foreground">Research Center</Link> / Report</div>
      <PageHeader title={report.title} description={`${dateTime(r.createdAt)} · subject: ${r.subjectKind} · `} actions={<><Link href={subjectHref} className="text-xs text-primary hover:underline">Open subject →</Link><ActionButton href={`/api/ai/report?id=${r.id}`} method="DELETE" variant="ghost" confirm="Delete this report?" successMessage="Report deleted"><Trash2 className="size-4" /></ActionButton></>} />
      <ReportView report={report} mode={r.model} isDemo={r.isDemoData} />
    </div>
  );
}
