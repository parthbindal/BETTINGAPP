import type { ReactNode } from "react";
import { Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {/* Grey, not blue: primary means "click this", and an eyebrow is not clickable. */}
        {eyebrow && <div className="label-micro mb-2">{eyebrow}</div>}
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, right, children, className, id }: { title?: ReactNode; description?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("card-surface min-w-0 p-5", className)}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A full-width block of a page, titled the way the track record titles its
 * ledgers: the heading and one sentence of method OUTSIDE the card, the data
 * inside it. Use `Section` (title inside the card) only for panels that sit
 * side by side; a page built entirely of 14px card titles has no hierarchy.
 */
export function PageSection({ title, description, right, children, className, id }: { title: ReactNode; description?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-20", className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Empty state: one quiet visual (the icon inside soft concentric rings), what
 * will appear here, and `when`. With this little data, empty is the normal
 * case, so it must read as a designed screen with a date on it, never as a
 * page that failed to load.
 */
export function EmptyState({ title, description, action, icon, when, children }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; when?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-12 text-center">
      <div className="relative flex size-20 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border border-border/60" />
        <span className="absolute inset-3 rounded-full border border-border bg-surface-1" />
        <span className="relative text-muted-foreground [&_svg]:size-6">{icon ?? <Sparkle />}</span>
      </div>
      <div className="text-base font-medium">{title}</div>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {when && <p className="label-micro text-foreground/70">{when}</p>}
      {children}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground/80", className)}>
      EDGEWISE is an educational and analytical tool. It does not execute wagers, hold funds, or provide financial advice. Probabilities and model estimates are
      uncertain; historical performance does not guarantee future results. Must be 18+. If gambling is a problem, call or text 1-800-GAMBLER.
    </p>
  );
}
