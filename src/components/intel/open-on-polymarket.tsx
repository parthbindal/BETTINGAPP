import { ExternalLink, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { polymarketMarketUrl } from "@/lib/intel";
import { cn } from "@/lib/utils";

/**
 * The one call to action on a signal or trade: open this exact question on
 * Polymarket. The URL cannot pre-select a side, so the label names it.
 * EDGEWISE never places or holds bets; the note under the button says so.
 *
 * `inPlay = false` (price at or beyond 3¢ / 97¢) renders a disabled
 * "Market closed" control instead of a link into a decided market.
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
  className,
}: {
  title: string;
  outcome: string;
  eventSlug: string | null | undefined;
  marketSlug?: string | null;
  inPlay?: boolean;
  variant?: "full" | "compact" | "icon";
  note?: boolean;
  /** Compact only: "Back KNICKS" instead of "Back KNICKS on Polymarket", for narrow spots. */
  short?: boolean;
  className?: string;
}) {
  const url = polymarketMarketUrl(eventSlug, marketSlug);
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
    if (variant === "icon") {
      return (
        <span className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "cursor-not-allowed opacity-50", className)} aria-disabled="true" title={why}>
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

  const label = `Back ${side} on Polymarket`;
  const aria = `${label}: ${title}. Opens Polymarket in a new tab.`;

  if (variant === "compact") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} title="Opens Polymarket. EDGEWISE does not place or hold bets." className={cn(buttonVariants({ variant: "default", size: "sm" }), "max-w-full font-semibold", short && "h-auto min-h-7 whitespace-normal py-1 text-left leading-tight", className)}>
        <span className={short ? "" : "truncate"}>{short ? `Back ${side}` : label}</span>
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
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">Opens Polymarket. EDGEWISE does not place or hold bets.</p>}
    </div>
  );
}
