/** Per-million-token prices (USD) for cost tracking. Update when Anthropic pricing changes. */
export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
};

export function estimateCostUsd(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING["claude-opus-5-5"]!;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return ((usage.input_tokens - cacheRead) * p.input + cacheRead * p.cacheRead + usage.output_tokens * p.output) / 1_000_000;
}
