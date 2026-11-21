/**
 * Lightweight community guardrail. EDGEWISE is educational: posts that tout
 * guaranteed outcomes or sell picks are rejected with an explanation. This is
 * a first filter, not a substitute for human moderation.
 */
const TOUT_PATTERNS: RegExp[] = [
  /\bguarantee[sd]?\b.{0,24}\b(win|winner|profit|money|return|lock|hit)/i,
  /\block of the (day|week|month|year)\b/i,
  /\bfree money\b/i,
  /\b(can'?t|cannot|won'?t) lose\b/i,
  /\bsure (thing|bet|win)\b/i,
  /\brisk[- ]free (bet|profit|money)\b/i,
  /\b(dm|message|text|telegram|whatsapp)\b.{0,20}\b(picks|plays|locks|signals)\b/i,
  /\b(buy|sell|selling|subscribe to)\b.{0,16}\b(my )?(picks|plays|locks|signals)\b/i,
  /\b100\s?% (win|hit|sure|guaranteed)/i,
];

export function checkCommunityContent(text: string): { ok: true } | { ok: false; reason: string } {
  for (const re of TOUT_PATTERNS) {
    if (re.test(text)) {
      return { ok: false, reason: "Community guidelines: no guaranteed-win claims and no selling or soliciting picks. Share your reasoning and uncertainty instead." };
    }
  }
  if (/(https?:\/\/\S+\s*){4,}/i.test(text)) return { ok: false, reason: "Too many links in one post." };
  return { ok: true };
}
