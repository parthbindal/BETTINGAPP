import { Bone, PageHeaderSkeleton, SignalCardSkeleton } from "@/components/motion/skeletons";

/** Mirrors Signals: header, topic chips, "More filters", then the money-tiered card grid. */
export default function Loading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading Signals">
      <PageHeaderSkeleton />
      <div className="space-y-3">
        <div className="flex gap-2">
          {[20, 16, 24, 14, 16, 16].map((w, i) => (
            <Bone key={i} className="h-7 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <Bone className="h-11 w-full rounded-xl" />
      </div>
      <div className="space-y-4">
        <Bone className="h-3 w-72" />
        <div className="grid grid-flow-row-dense gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SignalCardSkeleton big />
          {[0, 1, 2, 3].map((i) => (
            <SignalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
