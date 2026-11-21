import { relative } from "@/lib/format";
import { ageMs } from "@/lib/intel";
import { cn } from "@/lib/utils";

const STALE_MS = 6 * 3_600_000;

/** When the figures on a page were scanned. Snapshot data is batch-refreshed, never presented as live. */
export function ScanFreshness({ generatedAt, note, className }: { generatedAt: string; note?: string; className?: string }) {
  const stale = ageMs(generatedAt) > STALE_MS;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", stale ? "bg-status-warning" : "bg-status-good")} aria-hidden="true" />
      <span>
        Polymarket data scanned {relative(generatedAt)}
        {stale ? " (stale)" : ""}
        {note ? ` · ${note}` : ""}
      </span>
    </span>
  );
}
