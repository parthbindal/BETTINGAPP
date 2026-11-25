import { relative } from "@/lib/format";
import { ageMs } from "@/lib/intel";
import { cn } from "@/lib/utils";

/**
 * Scans run hourly (SCAN_EVERY_MS in whales.ts). One older than this means
 * the scheduler or Polymarket has stopped answering, and the line says so.
 */
export const SCAN_STALE_MS = 2 * 3_600_000;

/**
 * The credibility line: when the figures on this page were read from
 * Polymarket. A fresh scan gets the page's one .pulse-live dot; a stale one
 * gets a still warning dot and says so. Snapshot data, never called "live".
 */
/** Matches SCAN_EVERY_MS in lib/whales.ts (not imported: that module pulls in the database, and client code imports this file). */
const SCAN_EVERY_MS = 60 * 60_000;

/** "09:18 UTC": the clock time of the next automatic scan. */
function nextScanLabel(generatedAt: string): string {
  const d = new Date(Date.parse(generatedAt) + SCAN_EVERY_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function ScanFreshness({ generatedAt, note, className }: { generatedAt: string; note?: string; className?: string }) {
  const age = ageMs(generatedAt);
  const stale = age > SCAN_STALE_MS;
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {stale ? <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" /> : <span className="pulse-live shrink-0" aria-hidden="true" />}
      <span>
        <span className="text-foreground/85">Scanned {relative(generatedAt)}</span>
        {/* Says out loud that nobody has to press Refresh: the scan repeats every hour on its own. */}
        {stale ? ` · older than ${SCAN_STALE_MS / 3_600_000} hours` : age >= SCAN_EVERY_MS ? " · next automatic scan running now" : ` · updates on its own when you open the app and every hour (next by ${nextScanLabel(generatedAt)})`}
        {note ? ` · ${note}` : ""}
      </span>
    </p>
  );
}
