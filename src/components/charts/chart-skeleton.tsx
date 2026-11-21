import { cn } from "@/lib/utils";

/**
 * Silhouette of a chart for loading states: recessive axis ticks, hairline grid
 * and a shape that matches what is about to render. Deliberately not a plain
 * grey box, so the layout does not jump when the real chart arrives.
 *
 * Plain markup (no client hooks) so page-level `loading.tsx` server components
 * can use it directly.
 */

const BAR_HEIGHTS = [52, 74, 41, 88, 63, 35, 79, 57, 92, 48, 68, 44];

const LINE_PATH = "M0,70 L9,58 L18,63 L27,41 L36,47 L45,30 L55,36 L64,22 L73,28 L82,14 L91,19 L100,8";

export function ChartSkeleton({
  variant = "bars",
  height = 240,
  className,
}: {
  variant?: "bars" | "line" | "area";
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full gap-2", className)} style={{ height }} aria-hidden="true">
      {/* y-axis tick stubs */}
      <div className="flex w-8 shrink-0 flex-col justify-between py-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-1.5 w-full rounded-sm bg-muted/60 motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        {/* hairline grid */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-px w-full bg-border/50" />
          ))}
        </div>

        {variant === "bars" ? (
          <div className="absolute inset-x-0 bottom-4 top-0 flex items-end gap-[3%]">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-muted/70 motion-safe:animate-pulse motion-reduce:animate-none"
                style={{ height: `${h}%`, animationDelay: `${i * 55}ms` }}
              />
            ))}
          </div>
        ) : (
          <svg
            className="absolute inset-x-0 bottom-4 top-0 h-[calc(100%-1rem)] w-full motion-safe:animate-pulse motion-reduce:animate-none"
            viewBox="0 0 100 80"
            preserveAspectRatio="none"
          >
            {variant === "area" && (
              <path d={`${LINE_PATH} L100,80 L0,80 Z`} fill="var(--muted)" fillOpacity={0.5} />
            )}
            <path d={LINE_PATH} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
        )}

        {/* x-axis tick stubs */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-1.5 w-6 rounded-sm bg-muted/60 motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
