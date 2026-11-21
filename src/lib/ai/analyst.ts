/**
 * Streaming AI Analyst. Uses the SDK tool runner (beta) with streaming so the
 * client sees text as it is generated while tools execute between turns.
 * Falls back to deterministic rule-based answers when no API key is set.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getAnthropic, AI_MODEL } from "@/lib/ai/client";
import { ANALYST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { runTool, toolDescriptions, toolList, toolSchemas, type ToolContext, type ToolName } from "@/lib/ai/tools";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { answerWithRules, RULES_HEADER_PROVIDER_ERROR } from "@/lib/ai/rules-mode";
import { db } from "@/lib/db";
import { logError } from "@/lib/ops";
import type { PlanLimits, Tier } from "@/lib/subscriptions/plans";
import type { Prisma } from "@/generated/prisma/client";

export interface SourceRef {
  tool: string;
  ref: string;
  source?: string;
  freshness?: string;
  fetchedAt?: string;
}

export type AnalystEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string; input: unknown }
  | { type: "tool_done"; name: string }
  | { type: "done"; mode: "llm" | "rules"; sources: SourceRef[]; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number } | null; refusal?: string }
  | { type: "error"; message: string };

export interface AnalystRequest {
  userId: string;
  tier: Tier;
  limits: PlanLimits;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  pageContext?: string | null;
}

function extractProvenance(result: unknown): Partial<SourceRef> {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  const prov = (r.provenance ?? (r.market as Record<string, unknown> | undefined)?.provenance) as { source?: string; freshness?: string; fetchedAt?: string } | undefined;
  return prov ? { source: prov.source, freshness: prov.freshness, fetchedAt: prov.fetchedAt } : {};
}

function refOf(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  return String(i.ticker ?? i.playerId ?? i.gameId ?? i.query ?? i.topic ?? "");
}

export async function* streamAnalyst(req: AnalystRequest): AsyncGenerator<AnalystEvent> {
  const client = getAnthropic();
  const ctx: ToolContext = { userId: req.userId, limits: req.limits };
  const sources: SourceRef[] = [];

  if (!client) {
    const out = await answerWithRules(req.message, ctx);
    // Count rule-based answers against the daily quota too (zero tokens, zero cost).
    await db.aiUsage.create({ data: { userId: req.userId, kind: "chat", model: "rules", costUsd: 0 } }).catch(() => {});
    yield { type: "text", text: out.text };
    yield { type: "done", mode: "rules", sources: out.sources, usage: null };
    return;
  }

  const tools = toolList().map((name: ToolName) =>
    betaZodTool({
      name,
      description: toolDescriptions[name],
      inputSchema: toolSchemas[name],
      run: async (input: unknown) => {
        try {
          const result = await runTool(name, input, ctx);
          sources.push({ tool: name, ref: refOf(input), ...extractProvenance(result) });
          return JSON.stringify(result);
        } catch (e) {
          await logError(`ai.tool.${name}`, e);
          return JSON.stringify({ error: "Tool failed; the data is unavailable right now. Say so rather than guessing." });
        }
      },
    }),
  );

  const dynamicContext = [
    `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    `User plan: ${req.tier}. Market history allowed: ${req.limits.marketHistoryDays} days.`,
    req.pageContext ? `The user is currently viewing: ${req.pageContext}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Recent non-empty turns only; the API requires the first message to be from the user.
  const recent = req.history.filter((m) => m.content.trim()).slice(-12);
  while (recent.length && recent[0]!.role !== "user") recent.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...recent.map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: req.message },
  ];

  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
  let refusal: string | undefined;
  let streamedText = false;

  try {
    const runner = client.beta.messages.toolRunner({
      model: AI_MODEL,
      max_tokens: 8_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: ANALYST_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamicContext },
      ],
      output_config: { effort: "medium" },
      tools,
      messages,
      stream: true,
      max_iterations: 8,
    });

    for await (const messageStream of runner) {
      for await (const event of messageStream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          yield { type: "tool_start", name: event.content_block.name, input: event.content_block.input };
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          streamedText = true;
          yield { type: "text", text: event.delta.text };
        }
      }
      const msg = await messageStream.finalMessage();
      usage.inputTokens += msg.usage.input_tokens;
      usage.outputTokens += msg.usage.output_tokens;
      usage.cacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;
      for (const block of msg.content) if (block.type === "tool_use") yield { type: "tool_done", name: block.name };
      if (msg.stop_reason === "refusal") {
        refusal = msg.stop_details?.explanation ?? "The model declined to answer this request.";
        break;
      }
      if (msg.stop_reason === "max_tokens" && msg.content.some((b) => b.type === "tool_use")) {
        yield { type: "text", text: "\n\n_Response was cut off before a tool call completed. Please ask a narrower question._" };
        break;
      }
    }
  } catch (e) {
    await logError("ai.analyst", e);
    // If the real model failed before streaming any text — e.g. the Anthropic
    // account has no API credits, the key is bad, or a transient provider error —
    // fall back to the rule-based analyst so the user still gets a real answer.
    // The "rules" mode flag keeps it honest; once the provider works the LLM path
    // takes over automatically with no further change.
    if (!streamedText) {
      try {
        const out = await answerWithRules(req.message, ctx, RULES_HEADER_PROVIDER_ERROR);
        await db.aiUsage.create({ data: { userId: req.userId, kind: "chat", model: "rules", costUsd: 0 } }).catch(() => {});
        yield { type: "text", text: out.text };
        yield { type: "done", mode: "rules", sources: out.sources, usage: null };
        return;
      } catch (fallbackErr) {
        await logError("ai.analyst.fallback", fallbackErr);
      }
    }
    const message =
      e instanceof Anthropic.AuthenticationError
        ? "The AI provider rejected the configured API key."
        : e instanceof Anthropic.RateLimitError
          ? "The AI provider is rate-limiting requests. Please try again shortly."
          : e instanceof Anthropic.APIError
            ? `AI provider error (${e.status}).`
            : "The analyst hit an unexpected error.";
    yield { type: "error", message };
  }

  usage.costUsd = estimateCostUsd(AI_MODEL, { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cache_read_input_tokens: usage.cacheReadTokens });
  await db.aiUsage
    .create({ data: { userId: req.userId, kind: "chat", model: AI_MODEL, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, costUsd: usage.costUsd } })
    .catch(() => {});
  yield { type: "done", mode: "llm", sources, usage, refusal };
}

/** Persist a turn to the conversation store. */
export async function saveTurn(conversationId: string, role: "user" | "assistant", content: string, extra?: { sources?: SourceRef[]; mode?: "llm" | "rules" }) {
  await db.aiMessage.create({
    data: { conversationId, role, content, sources: (extra?.sources ?? undefined) as unknown as Prisma.InputJsonValue | undefined, mode: extra?.mode },
  });
  await db.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

export async function countQueriesToday(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.aiUsage.count({ where: { userId, kind: "chat", createdAt: { gte: start } } });
}
