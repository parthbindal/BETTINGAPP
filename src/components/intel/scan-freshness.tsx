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
export function ScanFreshness({ generatedAt, note, className }: { generatedAt: string; note?: string; className?: string }) {
  const stale = ageMs(generatedAt) > SCAN_STALE_MS;
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {stale ? <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" /> : <span className="pulse-live shrink-0" aria-hidden="true" />}
      <span>
        <span className="text-foreground/85">Scanned {relative(generatedAt)}</span>
        {stale ? ` · older than ${SCAN_STALE_MS / 3_600_000} hours` : ""}
        {note ? ` · ${note}` : ""}
      </span>
    </p>
  );
}
