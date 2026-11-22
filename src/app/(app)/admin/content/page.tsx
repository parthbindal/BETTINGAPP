import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { COURSES } from "@/content/academy";
import { ARTICLES } from "@/content/articles";
import { Section } from "@/components/shared/page-header";
import { UpdateForm } from "@/components/admin/admin-forms";
import { ActionButton } from "@/components/shared/action-button";
import { dateShort } from "@/lib/format";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function AdminContentPage() {
  await requireAdmin();
  const [completions, attempts, updates] = await Promise.all([
    db.lessonProgress.groupBy({ by: ["courseSlug", "lessonSlug"], _count: { _all: true } }),
    db.quizAttempt.groupBy({ by: ["courseSlug", "lessonSlug"], _count: { _all: true }, _avg: { score: true, total: true } }),
    db.platformUpdate.findMany({ orderBy: { publishedAt: "desc" }, take: 20 }),
  ]);
  const done = new Map(completions.map((c) => [`${c.courseSlug}/${c.lessonSlug}`, c._count._all]));
  const quiz = new Map(attempts.map((a) => [`${a.courseSlug}/${a.lessonSlug}`, { n: a._count._all, avg: a._avg.score !== null && a._avg.total ? a._avg.score / a._avg.total : null }]));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Platform updates" description="Shown on every member's Overview">
          <UpdateForm />
          {updates.length > 0 && (
            <ul className="mt-4 divide-y divide-border/60">
              {updates.map((u) => (
                <li key={u.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm font-medium">
                      {u.title} <span className="text-[11px] font-normal text-muted-foreground">· {dateShort(u.publishedAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{u.body}</p>
                  </div>
                  <ActionButton href={`/api/admin/updates?id=${u.id}`} method="DELETE" size="xs" variant="ghost" confirm="Remove this update?">
                    Remove
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Public articles" description="Source: src/content/articles.ts (versioned in the repository)">
          <ul className="space-y-1.5">
            {ARTICLES.map((a) => (
              <li key={a.slug} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/learn/${a.slug}`} className="truncate hover:text-primary">
                  {a.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{a.category}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="Academy lessons" description="Source: src/content/academy.ts. Engagement figures are live from the database.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Lesson</th>
                <th className="py-1.5 font-medium">Level</th>
                <th className="tabular py-1.5 text-right font-medium">Completions</th>
                <th className="tabular py-1.5 text-right font-medium">Quiz attempts</th>
                <th className="tabular py-1.5 text-right font-medium">Avg. quiz score</th>
              </tr>
            </thead>
            <tbody>
              {COURSES.flatMap((c) =>
                c.lessons.map((l) => {
                  const k = `${c.slug}/${l.slug}`;
                  const qz = quiz.get(k);
                  return (
                    <tr key={k} className="border-t border-border/50">
                      <td className="py-1.5">
                        <Link href={`/academy/${c.slug}/${l.slug}`} className="hover:text-primary">
                          {l.title}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{c.title}</div>
                      </td>
                      <td className="py-1.5 capitalize text-muted-foreground">{c.level}</td>
                      <td className="tabular py-1.5 text-right">{done.get(k) ?? 0}</td>
                      <td className="tabular py-1.5 text-right">{qz?.n ?? 0}</td>
                      <td className="tabular py-1.5 text-right">{qz?.avg !== null && qz?.avg !== undefined ? `${Math.round(qz.avg * 100)}%` : "—"}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
