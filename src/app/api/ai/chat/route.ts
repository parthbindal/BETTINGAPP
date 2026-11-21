import { z } from "zod";
import { getApiContext } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { streamAnalyst, saveTurn, countQueriesToday, type AnalystEvent } from "@/lib/ai/analyst";
import { apiError } from "@/lib/api";
import { logError, trackUsage } from "@/lib/ops";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().max(64).nullish(),
  message: z.string().trim().min(1).max(4000),
  // Page context is restricted to known reference shapes; it is placed in the system prompt.
  context: z
    .string()
    .regex(/^(market|player|game):[A-Za-z0-9._:-]{1,80}$/)
    .nullish(),
});

/** Streams the analyst's answer as Server-Sent Events. */
export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return apiError("Sign in required.", 401);
  const rl = rateLimit(`ai.chat:${ctx.user.id}`, 10, 60_000);
  if (!rl.ok) return apiError("You are sending messages too quickly. Please wait a moment.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request.", 422);
  const { message, context } = parsed.data;

  const limit = ctx.entitlements.limits.aiQueriesPerDay;
  const used = await countQueriesToday(ctx.user.id);
  if (used >= limit) {
    return apiError(`You have used all ${limit} AI Analyst queries for today on the ${ctx.entitlements.tier} plan.`, 402, { upgrade: true });
  }

  let conversation = parsed.data.conversationId
    ? await db.aiConversation.findFirst({
        where: { id: parsed.data.conversationId, userId: ctx.user.id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 24 } },
      })
    : null;
  if (!conversation) {
    conversation = await db.aiConversation.create({
      data: { userId: ctx.user.id, title: message.slice(0, 80), context: context ? ({ context } as Prisma.InputJsonValue) : undefined },
      include: { messages: true },
    });
  }
  const conversationId = conversation.id;
  const history = [...conversation.messages].reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  await saveTurn(conversationId, "user", message);
  trackUsage("analyst.query", ctx.user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (obj: AnalystEvent | { type: "meta"; conversationId: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          open = false; // client went away
        }
      };
      send({ type: "meta", conversationId });
      let text = "";
      let final: Extract<AnalystEvent, { type: "done" }> | null = null;
      try {
        for await (const ev of streamAnalyst({ userId: ctx.user.id, tier: ctx.entitlements.tier, limits: ctx.entitlements.limits, history, message, pageContext: context ?? null })) {
          if (ev.type === "text") text += ev.text;
          if (ev.type === "done") final = ev;
          send(ev);
        }
      } catch (e) {
        await logError("api.ai.chat", e);
        send({ type: "error", message: "The analyst hit an unexpected error." });
      }
      const content = text || (final?.refusal ? `_${final.refusal}_` : "");
      if (content) {
        await saveTurn(conversationId, "assistant", content, { sources: final?.sources, mode: final?.mode }).catch((e) => logError("api.ai.chat.save", e));
      }
      if (open) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
