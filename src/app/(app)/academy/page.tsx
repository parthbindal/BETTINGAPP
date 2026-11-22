import Link from "next/link";
import { Award, Flame, Lock } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getAcademyProgress } from "@/lib/academy";
import { COURSES, LEVELS } from "@/content/academy";
import { PageHeader, Section } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import { dateShort } from "@/lib/format";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function AcademyPage() {
  const session = await requireUser("/academy");
  const [ent, progress] = await Promise.all([getEntitlements(session.user.id), getAcademyProgress(session.user.id)]);
  return (
    <div className="space-y-5">
      <PageHeader title="Learning Academy" description="Short lessons, interactive examples and quizzes that take you from 'what is a prediction market?' to calibration and Monte Carlo. Beginner content is free for everyone." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Lessons completed" value={`${progress.completedCount}/${progress.totalLessons}`} />
        <StatCard label="Learning streak" value={`${progress.streak} day${progress.streak === 1 ? "" : "s"}`} icon={<Flame />} hint="Consecutive days with a lesson or quiz" />
        <StatCard label="Badges" value={progress.achievements.length} icon={<Award />} />
      </div>
      {LEVELS.map((lvl) => {
        const allowed = ent.limits.academyLevels.includes(lvl.key);
        return (
          <Section key={lvl.key} title={<span className="flex items-center gap-2">{lvl.label} {!allowed && <Lock className="size-3.5 text-muted-foreground" />}</span>} description={lvl.blurb} right={!allowed && <Link href="/pricing" className="text-xs text-primary hover:underline">Unlock with Pro →</Link>}>
            <div className="grid gap-3 md:grid-cols-2">
              {COURSES.filter((c) => c.level === lvl.key).map((c) => {
                const pr = progress.byCourse.find((x) => x.slug === c.slug)!;
                return (
                  <Link key={c.slug} href={allowed ? `/academy/${c.slug}` : "/pricing"} className={cn("rounded-lg border border-border/60 p-4 hover:border-primary/40", !allowed && "opacity-70")}>
                    <div className="text-sm font-semibold">{c.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>{c.lessons.length} lessons · {c.lessons.reduce((a, l) => a + l.minutes, 0)} min</span><span className="tabular">{pr.completed}/{pr.total}</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-3"><div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${(pr.completed / pr.total) * 100}%` }} /></div>
                  </Link>
                );
              })}
            </div>
          </Section>
        );
      })}
      <Section title="Achievements">
        {progress.achievements.length ? <ul className="flex flex-wrap gap-2">{progress.achievements.map((a) => <li key={a.key} className="rounded-lg border border-border/60 px-3 py-2 text-xs"><div className="font-medium">{a.title}</div><div className="text-muted-foreground">{a.description} · {dateShort(a.earnedAt)}</div></li>)}</ul> : <p className="text-xs text-muted-foreground">Complete a lesson to earn your first badge.</p>}
      </Section>
    </div>
  );
}
