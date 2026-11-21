import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/env";

let client: Anthropic | null = null;

/** Anthropic client, or null when no credentials are configured (rule-based mode). */
export function getAnthropic(): Anthropic | null {
  if (!config.isAiConfigured) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 120_000, maxRetries: 2 });
  return client;
}

export const AI_MODEL = config.anthropicModel;
