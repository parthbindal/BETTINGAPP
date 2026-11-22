import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, getEntitlements } from "@/lib/session";
import { getAcademyProgress } from "@/lib/academy";
import { getLesson } from "@/content/academy";
import { PageHeader, Section } from "@/components/shared/page-header";
import { Markdown } from "@/components/shared/markdown";
import { Quiz } from "@/components/academy/quiz";
import { LessonInteractive } from "@/components/academy/interactive";
import { ActionButton } from "@/components/shared/action-button";
import { CheckCircle2 } from "lucide-react";
import { trackUsage } from "@/lib/ops";
import { LinkButton } from "@/components/ui/link-button";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function LessonPage({ params }: { params: Promise<{ course: string; lesson: string }> }) {
  const { course: cs, lesson: ls } = await params;
  const hit = getLesson(cs, ls);
  if (!hit) notFound();
  const { course, lesson } = hit;
  const session = await requireUser(`/academy/${cs}/${ls}`);
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.academyLevels.includes(course.level)) redirect("/pricing");
  const progress = await getAcademyProgress(session.user.id);
  const done = progress.completedLessons.has(`${course.slug}/${lesson.slug}`);
  const idx = course.lessons.findIndex((l) => l.slug === lesson.slug);
  const prev = course.lessons[idx - 1];
  const next = course.lessons[idx + 1];
  trackUsage("academy.lesson", session.user.id, { course: cs, lesson: ls });
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/academy" className="hover:text-foreground">Academy</Link> / <Link href={`/academy/${course.slug}`} className="hover:text-foreground">{course.title}</Link> / Lesson {idx + 1}</div>
      <PageHeader eyebrow={`${course.level} · ${lesson.minutes} min`} title={lesson.title} description={lesson.summary} actions={done ? <span className="inline-flex items-center gap-1.5 text-sm text-status-good"><CheckCircle2 className="size-4" /> Completed</span> : <ActionButton href="/api/academy/complete" body={{ courseSlug: course.slug, lessonSlug: lesson.slug }} successMessage="Lesson marked complete">Mark complete</ActionButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section className="lg:col-span-2"><Markdown className="text-[15px]">{lesson.body}</Markdown></Section>
        <div className="space-y-4">
          {lesson.interactive && <Section title="Try it" description="Interactive example"><LessonInteractive kind={lesson.interactive} /></Section>}
          <Section title="Knowledge check" description={`${lesson.quiz.length} questions · pass to complete`}><Quiz courseSlug={course.slug} lessonSlug={lesson.slug} questions={lesson.quiz} /></Section>
        </div>
      </div>
      <div className="flex items-center justify-between">
        {prev ? <LinkButton href={`/academy/${course.slug}/${prev.slug}`} variant="outline" size="sm">← {prev.title}</LinkButton> : <span />}
        {next ? <LinkButton href={`/academy/${course.slug}/${next.slug}`} size="sm">{next.title} →</LinkButton> : <LinkButton href="/academy" size="sm">Back to Academy</LinkButton>}
      </div>
    </div>
  );
}
