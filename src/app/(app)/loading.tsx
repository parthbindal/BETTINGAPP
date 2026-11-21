/** Suspense fallback for every authenticated page; ships in the static shell. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-surface-2" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface-2/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-surface-2/50" />
    </div>
  );
}
