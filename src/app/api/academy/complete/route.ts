import { z } from "zod";
import { guarded, json, apiError } from "@/lib/api";
import { getLesson } from "@/content/academy";
import { completeLesson } from "@/lib/academy";
import { trackUsage } from "@/lib/ops";

const Body = z.object({ courseSlug: z.string().max(80), lessonSlug: z.string().max(80) });

export const POST = guarded({ schema: Body, scope: "academy.complete", limit: 60 }, async (ctx, body) => {
  const hit = getLesson(body.courseSlug, body.lessonSlug);
  if (!hit) return apiError("Lesson not found.", 404);
  if (!ctx.entitlements.limits.academyLevels.includes(hit.course.level)) return apiError("This course is not included in your plan.", 402, { upgrade: true });
  await completeLesson(ctx.user.id, body.courseSlug, body.lessonSlug);
  trackUsage("academy.complete", ctx.user.id, { course: body.courseSlug, lesson: body.lessonSlug });
  return json({ ok: true });
});
