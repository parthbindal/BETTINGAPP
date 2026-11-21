export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-surface-2/50" />
    </div>
  );
}
