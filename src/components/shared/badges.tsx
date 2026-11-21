import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/lib/subscriptions/plans";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";

export function ConfidenceBadge({ level, className }: { level: "low" | "medium" | "high"; className?: string }) {
  const map = {
    low: "border-status-serious/40 text-status-serious bg-status-serious/10",
    medium: "border-status-warning/40 text-status-warning bg-status-warning/10",
    high: "border-status-good/40 text-status-good bg-status-good/10",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", map[level], className)}>{level} confidence</span>;
}

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const map: Record<Tier, string> = {
    free: "bg-secondary text-secondary-foreground",
    pro: "bg-primary/15 text-primary border-primary/30",
  };
  return <Badge className={cn("border capitalize", map[tier], className)}>{tier}</Badge>;
}

export function DemoTag({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded border border-status-serious/40 bg-status-serious/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-serious", className)}>Demo</span>;
}

/** Inline gate: shows an upgrade card instead of children when the feature is locked. */
export function UpgradeGate({ locked, feature, requiredTier, children, compact = false }: { locked: boolean; feature: string; requiredTier: Tier; children: React.ReactNode; compact?: boolean }) {
  if (!locked) return <>{children}</>;
  return (
    <div className={cn("card-surface flex flex-col items-start gap-3 p-5", compact && "p-4")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lock className="size-4 text-primary" /> {feature}
      </div>
      <p className="text-xs text-muted-foreground">
        This feature is included in the <span className="font-medium capitalize text-foreground">{requiredTier}</span> plan and above. Core explanations, provenance and
        disclaimers always remain available on every plan.
      </p>
      <Link href="/pricing" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/85">
        <Sparkles className="size-3.5" /> Compare plans
      </Link>
    </div>
  );
}
