import { relative } from "@/lib/format";
import { ageMs } from "@/lib/intel";
import { cn } from "@/lib/utils";

const STALE_MS = 6 * 3_600_000;

/**
 * The credibility line: when the figures on this page were read from
 * Polymarket. A fresh scan gets the page's one .pulse-live dot; a stale one
 * gets a still warning dot and says so. Snapshot data, never called "live".
 */
export function ScanFreshness({ generatedAt, note, className }: { generatedAt: string; note?: string; className?: string }) {
  const stale = ageMs(generatedAt) > STALE_MS;
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {stale ? <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" /> : <span className="pulse-live shrink-0" aria-hidden="true" />}
      <span>
        <span className="text-foreground/85">Scanned {relative(generatedAt)}</span>
        {stale ? " · older than 6 hours" : ""}
        {note ? ` · ${note}` : ""}
      </span>
    </p>
  );
}
