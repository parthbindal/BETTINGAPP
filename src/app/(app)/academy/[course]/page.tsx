import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getAcademyProgress } from "@/lib/academy";
import { getCourse } from "@/content/academy";
import { PageHeader, Section } from "@/components/shared/page-header";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function CoursePage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const session = await requireUser(`/academy/${slug}`);
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.academyLevels.includes(course.level)) redirect("/pricing");
  const progress = await getAcademyProgress(session.user.id);
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/academy" className="hover:text-foreground">Academy</Link> / {course.title}</div>
      <PageHeader eyebrow={course.level} title={course.title} description={course.description} />
      <Section title="Lessons">
        <ol className="divide-y divide-border/60">
          {course.lessons.map((l, i) => {
            const done = progress.completedLessons.has(`${course.slug}/${l.slug}`);
            const best = progress.bestScores[`${course.slug}/${l.slug}`];
            return (
              <li key={l.slug}>
                <Link href={`/academy/${course.slug}/${l.slug}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2/40">
                  {done ? <CheckCircle2 className="size-5 text-status-good" /> : <Circle className="size-5 text-muted-foreground/50" />}
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{i + 1}. {l.title}</div><div className="text-xs text-muted-foreground">{l.summary}</div></div>
                  <div className="shrink-0 text-right text-[11px] text-muted-foreground">{l.minutes} min{best !== undefined && <div>Best quiz {Math.round(best * 100)}%</div>}</div>
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
