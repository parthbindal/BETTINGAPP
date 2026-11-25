import { format, formatDistanceToNowStrict, isValid } from "date-fns";

export function pct(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function pts(delta: number | null | undefined, digits = 1): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "—";
  const v = delta * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)} pts`;
}

export function cents(price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return "—";
  return `${Math.round(price * 100)}¢`;
}

export function usd(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(n);
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function num(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function dateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!isValid(dt)) return "—";
  return format(dt, "MMM d, yyyy");
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!isValid(dt)) return "—";
  return format(dt, "MMM d, yyyy · h:mm a");
}

/**
 * "Nov 25, 05:41 UTC". An absolute stamp in one stated zone: it reads the same
 * on every server and in every reader's head, and it never consults the clock,
 * so it is safe in prerendered output (unlike relative()).
 */
export function utcStamp(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!isValid(dt)) return "—";
  const month = dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${month} ${dt.getUTCDate()}, ${hh}:${mm} UTC`;
}

export function relative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!isValid(dt)) return "—";
  const diff = dt.getTime() - Date.now();
  const s = formatDistanceToNowStrict(dt, { addSuffix: false });
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
