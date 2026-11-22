import { Bone, HeroSignalSkeleton, PageHeaderSkeleton, SignalCardSkeleton } from "@/components/motion/skeletons";

/** Mirrors the Home layout: header, hero signal, at-a-glance strip, three more signals. */
export default function Loading() {
  return (
    <div className="space-y-12" aria-busy="true" aria-label="Loading Home">
      <PageHeaderSkeleton />
      <div className="space-y-3">
        <Bone className="h-3 w-56" />
        <HeroSignalSkeleton />
      </div>
      <div className="card-surface grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-8 w-24" />
            <Bone className="h-4 w-36" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SignalCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
