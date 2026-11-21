import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { getLesson } from "@/content/academy";
import { submitQuiz } from "@/lib/academy";
import { trackUsage } from "@/lib/ops";

const Body = z.object({ courseSlug: z.string().max(80), lessonSlug: z.string().max(80), answers: z.array(z.number().int().min(0).max(10)).min(1).max(20) });

export const POST = guarded({ schema: Body, scope: "academy.quiz", limit: 40 }, async (ctx, body) => {
  const hit = getLesson(body.courseSlug, body.lessonSlug);
  if (!hit) return apiError("Lesson not found.", 404);
  if (!ctx.entitlements.limits.academyLevels.includes(hit.course.level)) return apiError("This course is not included in your plan.", 402, { upgrade: true });
  if (body.answers.length !== hit.lesson.quiz.length) return apiError("Answer every question.", 422);
  const result = await submitQuiz(ctx.user.id, body.courseSlug, body.lessonSlug, body.answers);
  trackUsage("academy.quiz", ctx.user.id, { course: body.courseSlug, lesson: body.lessonSlug, score: result.score });
  return json(result);
});
