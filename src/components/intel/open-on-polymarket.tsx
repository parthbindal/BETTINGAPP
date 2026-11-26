import { ExternalLink, Globe, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { polymarketUsUrl } from "@/lib/intel";
import { cn } from "@/lib/utils";

/**
 * The one call to action on a signal or trade: open this game on Polymarket US,
 * the exchange US members can trade on, but ONLY when Polymarket US lists it.
 *
 * `usEvent` is set by an exact lookup against Polymarket US's own API
 * (usListedEvents), so a link here always opens the right, real page. When it
 * is missing the market is not on Polymarket US (most international markets
 * are not: esports, overseas tennis, most politics and novelty markets), and
 * the control says so instead of linking anywhere. EDGEWISE never places or
 * holds bets.
 *
 * `inPlay = false` (price at or beyond 3¢ / 97¢) renders "Market closed".
 *
 * Only ONE solid primary button per screen: `full` is for the featured signal
 * (and the top card on Signals). Everything else uses the quiet `ghost`
 * (text link) or `ghost-icon` variants. `market` drops the side from the
 * label, for split markets where EDGEWISE must not offer both sides.
 */
export function OpenOnPolymarket({
  title,
  outcome,
  usEvent,
  inPlay = true,
  variant = "full",
  note = variant === "full",
  short = false,
  market = false,
  className,
}: {
  title: string;
  outcome: string;
  /** Polymarket US event slug, present only when Polymarket US lists this game (see usListedEvents). */
  usEvent?: string | null;
  /** Accepted from older callers; unused (those paths exist only on polymarket.com). */
  eventSlug?: string | null;
  marketSlug?: string | null;
  inPlay?: boolean;
  variant?: "full" | "compact" | "icon" | "ghost" | "ghost-icon";
  note?: boolean;
  /** Compact only: a shorter label for narrow spots. */
  short?: boolean;
  /** Label the link as the game, not a side. */
  market?: boolean;
  className?: string;
}) {
  const url = polymarketUsUrl(usEvent);
  const side = outcome.trim().toUpperCase() || "this outcome";

  if (!inPlay) return <Unavailable variant={variant} note={note} className={className} icon={Lock} label="Market closed" detail="This market has effectively been decided." />;
  if (!url) {
    return (
      <Unavailable
        variant={variant}
        note={note}
        className={className}
        icon={Globe}
        label="Not on Polymarket US"
        detail="The top traders hold this on Polymarket's international exchange. Polymarket US does not list it, so there is nothing to trade from the US."
      />
    );
  }

  // The page is the game on Polymarket US, which shows every market on it; the side is named so it is easy to find.
  const label = market ? "Trade this game on Polymarket US" : short ? `Trade ${side}` : `Trade ${side} on Polymarket US`;
  const note_ = "Opens this game on Polymarket US. Its prices can differ a little from the figures here, which come from Polymarket's international exchange. EDGEWISE does not place or hold bets.";
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
        <span className={short ? "" : "truncate"}>{label}</span>
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
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">Opens the game on Polymarket US; prices there can differ a little. EDGEWISE does not place or hold bets.</p>}
    </div>
  );
}

/** No link: the market is decided, or Polymarket US does not list it. Quiet, never a disabled primary button. */
function Unavailable({ variant, note, className, icon: Icon, label, detail }: { variant: string; note: boolean; className?: string; icon: typeof Lock; label: string; detail: string }) {
  if (variant === "ghost-icon" || variant === "icon") {
    return (
      <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "cursor-default text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60", className)} title={`${label}. ${detail}`}>
        <Icon aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (variant === "full") {
    return (
      <div className={cn("rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2.5", className)}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/85">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> {label}
        </p>
        {note && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
      </div>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={detail}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" /> {label}
    </span>
  );
}
