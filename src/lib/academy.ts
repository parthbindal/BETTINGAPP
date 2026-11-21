import { db } from "@/lib/db";
import { COURSES, ACHIEVEMENTS, totalLessons, type Level } from "@/content/academy";
import type { Prisma } from "@/generated/prisma/client";

export async function getAcademyProgress(userId: string) {
  const [progress, attempts, achievements] = await Promise.all([
    db.lessonProgress.findMany({ where: { userId } }),
    db.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.achievement.findMany({ where: { userId } }),
  ]);
  const done = new Set(progress.map((p) => `${p.courseSlug}/${p.lessonSlug}`));
  const byCourse = COURSES.map((c) => ({
    slug: c.slug,
    level: c.level,
    completed: c.lessons.filter((l) => done.has(`${c.slug}/${l.slug}`)).length,
    total: c.lessons.length,
  }));
  // streak: consecutive days with any learning activity ending today or yesterday
  const days = new Set([...progress.map((p) => p.completedAt), ...attempts.map((a) => a.createdAt)].map((d) => d.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    completedLessons: done,
    completedCount: done.size,
    totalLessons: totalLessons(),
    byCourse,
    streak,
    achievements: achievements.map((a) => ({ key: a.key, earnedAt: a.earnedAt, ...(ACHIEVEMENTS[a.key] ?? { title: a.key, description: "" }) })),
    bestScores: attempts.reduce<Record<string, number>>((acc, a) => {
      const k = `${a.courseSlug}/${a.lessonSlug}`;
      acc[k] = Math.max(acc[k] ?? 0, a.score / a.total);
      return acc;
    }, {}),
  };
}

export async function awardAchievement(userId: string, key: string) {
  if (!ACHIEVEMENTS[key]) return;
  await db.achievement.upsert({ where: { userId_key: { userId, key } }, create: { userId, key }, update: {} });
}

export async function completeLesson(userId: string, courseSlug: string, lessonSlug: string) {
  await db.lessonProgress.upsert({
    where: { userId_courseSlug_lessonSlug: { userId, courseSlug, lessonSlug } },
    create: { userId, courseSlug, lessonSlug },
    update: {},
  });
  const prog = await getAcademyProgress(userId);
  await awardAchievement(userId, "first_lesson");
  for (const c of prog.byCourse) if (c.completed === c.total) await awardAchievement(userId, `${c.level}_complete`);
  if (prog.streak >= 7) await awardAchievement(userId, "streak_7");
  return prog;
}

export async function submitQuiz(userId: string, courseSlug: string, lessonSlug: string, answers: number[]) {
  const course = COURSES.find((c) => c.slug === courseSlug);
  const lesson = course?.lessons.find((l) => l.slug === lessonSlug);
  if (!course || !lesson) throw new Error("Lesson not found");
  const results = lesson.quiz.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, why: q.why }));
  const score = results.filter((r) => r.correct).length;
  await db.quizAttempt.create({ data: { userId, courseSlug, lessonSlug, score, total: lesson.quiz.length, answers: answers as unknown as Prisma.InputJsonValue } });
  if (score === lesson.quiz.length) await awardAchievement(userId, "perfect_quiz");
  if (score >= Math.ceil(lesson.quiz.length * 0.66)) await completeLesson(userId, courseSlug, lessonSlug);
  return { score, total: lesson.quiz.length, results, passed: score >= Math.ceil(lesson.quiz.length * 0.66) };
}

export function levelAllowed(level: Level, allowed: Level[]) {
  return allowed.includes(level);
}
