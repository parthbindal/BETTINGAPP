import { ExternalLink, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { polymarketMarketUrl } from "@/lib/intel";
import { cn } from "@/lib/utils";

/**
 * The one call to action on a signal or trade: open this exact market on
 * polymarket.com, where every figure here comes from. The URL cannot pre-select
 * a side, so the label names it. EDGEWISE never places or holds bets; the note
 * under the button says so.
 *
 * `inPlay = false` (price at or beyond 3¢ / 97¢) renders a quiet "Market
 * closed" instead of a link into a decided market.
 *
 * Only ONE solid primary button per screen: `full` is for the featured signal
 * (and the top card on Signals). Everything else uses the quiet `ghost`
 * (text link) or `ghost-icon` variants. `market` drops the side from the
 * label, for split markets where EDGEWISE must not offer both sides.
 */
export function OpenOnPolymarket({
  title,
  outcome,
  eventSlug,
  marketSlug,
  inPlay = true,
  variant = "full",
  note = variant === "full",
  short = false,
  market = false,
  className,
}: {
  title: string;
  outcome: string;
  eventSlug: string | null | undefined;
  marketSlug?: string | null;
  inPlay?: boolean;
  variant?: "full" | "compact" | "icon" | "ghost" | "ghost-icon";
  note?: boolean;
  /** Compact only: "Back KNICKS" instead of "Back KNICKS on Polymarket", for narrow spots. */
  short?: boolean;
  /** Label the link as the market, not a side ("View market on Polymarket"). */
  market?: boolean;
  className?: string;
}) {
  const url = polymarketMarketUrl(eventSlug, marketSlug);
  const side = outcome.trim().toUpperCase() || "this outcome";

  if (!inPlay || !url) {
    const label = !inPlay ? "Market closed" : "Link unavailable";
    const detail = !inPlay ? "This market has effectively been decided." : "Polymarket did not return a link for this market.";
    if (variant === "ghost-icon" || variant === "icon") {
      return (
        <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "cursor-default text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60", className)} title={`${label}. ${detail}`}>
          <Lock aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    if (variant === "full") {
      return (
        <div className={cn("rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2.5", className)}>
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/85">
            <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> {label}
          </p>
          {note && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
        </div>
      );
    }
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={detail}>
        <Lock className="size-3.5 shrink-0" aria-hidden="true" /> {label}
      </span>
    );
  }

  const label = market ? "View market on Polymarket" : `Back ${side} on Polymarket`;
  const note_ = "Opens this market on Polymarket. EDGEWISE does not place or hold bets.";
  const aria = `${label}: ${title}. ${note_} Opens in a new tab.`;

  if (variant === "ghost") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={note_} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline", className)}>
        <span className="truncate">{label}</span>
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      </a>
    );
  }
  if (variant === "ghost-icon" || variant === "icon") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={label} className={cn(buttonVariants({ variant: variant === "icon" ? "default" : "ghost", size: "icon-sm" }), variant === "ghost-icon" && "text-primary hover:text-primary", className)}>
        <ExternalLink aria-hidden="true" />
      </a>
    );
  }
  if (variant === "compact") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={note_} className={cn(buttonVariants({ variant: "default", size: "sm" }), "max-w-full font-semibold", short && "h-auto min-h-7 whitespace-normal py-1 text-left leading-tight", className)}>
        <span className={short ? "" : "truncate"}>{short ? `Back ${side}` : label}</span>
        <ExternalLink aria-hidden="true" />
      </a>
    );
  }
  return (
    <div className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-auto min-h-9 w-full whitespace-normal py-2 text-center font-semibold leading-tight")}>
        <span>{label}</span>
        <ExternalLink aria-hidden="true" />
      </a>
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">Opens Polymarket. EDGEWISE does not place or hold bets.</p>}
    </div>
  );
}
