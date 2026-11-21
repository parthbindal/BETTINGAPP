/** Only same-origin relative paths are allowed as post-auth redirect targets. */
export function safeNextPath(raw: string | null | undefined, fallback = "/overview"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
