import { cn } from "@/lib/utils";
import type { Freshness, Provenance } from "@/lib/data/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relative } from "@/lib/format";

const STYLES: Record<Freshness, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-status-good", text: "text-status-good" },
  delayed: { label: "Delayed", dot: "bg-status-warning", text: "text-status-warning" },
  historical: { label: "Historical", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  demo: { label: "Demo data", dot: "bg-status-serious", text: "text-status-serious" },
  estimate: { label: "Model estimate", dot: "bg-chart-7", text: "text-chart-7" },
};

export function DataBadge({ provenance, className, compact = false }: { provenance: Provenance; className?: string; compact?: boolean }) {
  const s = STYLES[provenance.freshness];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/60 px-2 py-0.5 text-[11px] font-medium leading-none",
              s.text,
              className,
            )}
          />
        }
      >
        <span className={cn("size-1.5 rounded-full", s.dot, provenance.freshness === "live" && "animate-pulse")} />
        {s.label}
        {!compact && <span className="text-muted-foreground">· {provenance.source}</span>}
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          <div>
            Source: <span className="font-medium">{provenance.source}</span>
          </div>
          <div>Fetched {relative(provenance.fetchedAt)}</div>
          {provenance.note && <div className="text-muted-foreground">{provenance.note}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function FreshnessDot({ freshness }: { freshness: Freshness }) {
  return <span className={cn("inline-block size-1.5 rounded-full", STYLES[freshness].dot)} />;
}
