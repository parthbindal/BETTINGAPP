import { ExternalLink, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { polymarketMarketUrl } from "@/lib/intel";
import { cn } from "@/lib/utils";

/**
 * The one call to action on a signal or trade: find this question on
 * Polymarket US, the exchange US members can trade on (polymarketMarketUrl
 * explains why it is a search, not a direct page). The URL cannot pre-select a
 * side, so the label names it. EDGEWISE never places or holds bets, and its
 * figures come from Polymarket's international exchange, so prices on
 * Polymarket US can differ; the note under the button says both.
 *
 * `eventSlug` / `marketSlug` are accepted for callers but no longer used: those
 * paths exist only on polymarket.com.
 *
 * `inPlay = false` (price at or beyond 3¢ / 97¢) renders a disabled
 * "Market closed" control instead of a link into a decided market.
 *
 * Only ONE solid primary button per screen: `full` is for the featured signal
 * (and the top card on Signals). Everything else uses the quiet `ghost`
 * (text link) or `ghost-icon` variants, which keep the bet-free note in their
 * title and aria-label. `market` drops the side from the label, for split
 * markets where EDGEWISE must not offer both sides as calls to action.
 */
export function OpenOnPolymarket({
  title,
  outcome,
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
  /** Compact only: "Back KNICKS" instead of "Back KNICKS on Polymarket US", for narrow spots. */
  short?: boolean;
  /** Label the link as the market, not a side ("Find market on Polymarket US"). */
  market?: boolean;
  className?: string;
}) {
  const url = polymarketMarketUrl(title);
  const side = outcome.trim().toUpperCase() || "this outcome";

  if (!inPlay || !url) {
    const why = !inPlay ? "Market closed" : "Link unavailable";
    if (variant === "compact") {
      return (
        <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-not-allowed opacity-60", className)} aria-disabled="true">
          <Lock aria-hidden="true" /> {why}
        </span>
      );
    }
    if (variant === "ghost") {
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} aria-disabled="true">
          <Lock className="size-3.5" aria-hidden="true" /> {why}
        </span>
      );
    }
    if (variant === "icon" || variant === "ghost-icon") {
      return (
        <span className={cn(buttonVariants({ variant: variant === "icon" ? "outline" : "ghost", size: "icon-sm" }), "cursor-not-allowed opacity-50", className)} aria-disabled="true" title={why}>
          <Lock aria-hidden="true" />
          <span className="sr-only">{why}</span>
        </span>
      );
    }
    return (
      <div className={className}>
        <button type="button" disabled className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
          <Lock aria-hidden="true" /> {why}
        </button>
        {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{!inPlay ? "This market has effectively been decided." : "Polymarket did not return a link for this market."}</p>}
      </div>
    );
  }

  // "Find", never "Back": the link is a search, and it can surface a similar market first (see polymarketMarketUrl).
  const label = market ? "Find market on Polymarket US" : `Find ${side} on Polymarket US`;
  const note_ = "Opens a Polymarket US search for this question. Check it is the same market and date before trading; prices there can differ a little. EDGEWISE does not place or hold bets.";
  const aria = `${label}: ${title}. ${note_} Opens in a new tab.`;

  if (variant === "ghost") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={note_} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline", className)}>
        <span className="truncate">{label}</span>
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      </a>
    );
  }
  if (variant === "ghost-icon") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={label} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-primary hover:text-primary", className)}>
        <ExternalLink aria-hidden="true" />
      </a>
    );
  }

  if (variant === "compact") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={note_} className={cn(buttonVariants({ variant: "default", size: "sm" }), "max-w-full font-semibold", short && "h-auto min-h-7 whitespace-normal py-1 text-left leading-tight", className)}>
        <span className={short ? "" : "truncate"}>{short ? `Find ${side}` : label}</span>
        <ExternalLink aria-hidden="true" />
      </a>
    );
  }
  if (variant === "icon") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title={label} className={cn(buttonVariants({ variant: "default", size: "icon-sm" }), className)}>
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
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">Opens a Polymarket US search. Check it is the same market and date before trading; prices there can differ a little. EDGEWISE does not place or hold bets.</p>}
    </div>
  );
}
