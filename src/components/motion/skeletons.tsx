import type React from "react";
import { cn } from "@/lib/utils";

/**
 * Loading silhouettes that match the real layouts box for box, so nothing
 * jumps when content arrives. Plain markup: safe in loading.tsx server files.
 */
export function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("rounded-md bg-surface-2/80 motion-safe:animate-pulse", className)} style={style} aria-hidden="true" />;
}

export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Bone className="h-10 w-72 max-w-full" />
          <Bone className="h-4 w-[28rem] max-w-full" />
        </div>
        {action && <Bone className="h-8 w-28" />}
      </div>
      <Bone className="h-3.5 w-56" />
    </div>
  );
}

export function SignalCardSkeleton({ big = false }: { big?: boolean }) {
  return (
    <div className={cn("card-surface flex flex-col gap-4 p-4", big && "ring-1 ring-foreground/15")} aria-hidden="true">
      <div className="flex justify-between">
        <Bone className="h-3 w-32" />
        <Bone className="h-5 w-24 rounded-full" />
      </div>
      <Bone className="h-4 w-4/5" />
      <div className="flex items-end gap-3">
        <Bone className="h-8 w-12" />
        <Bone className="h-4 w-28" />
      </div>
      <Bone className="h-3 w-3/4" />
      <Bone className="h-1.5 w-full rounded-full" />
      <Bone className={cn("w-24", big ? "h-12" : "h-8")} />
      <Bone className="h-7 w-44" />
    </div>
  );
}

export function HeroSignalSkeleton() {
  return (
    <div className="card-surface grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12" aria-hidden="true">
      <div className="space-y-5">
        <Bone className="h-3 w-40" />
        <Bone className="h-8 w-11/12" />
        <div className="flex items-end gap-3">
          <Bone className="h-14 w-20" />
          <Bone className="h-5 w-32" />
        </div>
        <Bone className="h-4 w-3/4" />
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bone key={i} className="size-8 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <Bone className="h-1.5 w-full rounded-full" />
        <Bone className="h-9 w-32" />
        <Bone className="h-24 w-full" />
        <Bone className="h-9 w-full" />
      </div>
    </div>
  );
}

export function TradeRowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3" aria-hidden="true">
      <Bone className="size-[34px] shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Bone className="h-4 w-2/3" />
        <Bone className="h-3 w-1/2" />
        <Bone className="h-2.5 w-1/3" />
      </div>
      <Bone className="h-5 w-14" />
    </div>
  );
}
