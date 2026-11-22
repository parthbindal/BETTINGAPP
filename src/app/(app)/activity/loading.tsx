import { Bone, PageHeaderSkeleton, TradeRowSkeleton } from "@/components/motion/skeletons";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";

/** Mirrors Live Trades: header, 24-hour balance + daily chart, then the trade feed. */
export default function Loading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading Live Trades">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-surface space-y-4 p-5">
          <Bone className="h-4 w-28" />
          <div className="grid grid-cols-2 gap-3">
            <Bone className="h-8 w-24" />
            <Bone className="h-8 w-24" />
          </div>
          <Bone className="h-2.5 w-full rounded-full" />
        </div>
        <div className="card-surface p-5 lg:col-span-2">
          <Bone className="mb-4 h-4 w-40" />
          <ChartSkeleton variant="bars" height={200} />
        </div>
      </div>
      <div className="card-surface p-5">
        <div className="mb-4 flex justify-between">
          <Bone className="h-6 w-28" />
          <Bone className="h-8 w-44 rounded-full" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <TradeRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
