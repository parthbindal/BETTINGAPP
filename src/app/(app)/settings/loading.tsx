export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-40 animate-pulse rounded-xl bg-surface-2/60" />
      <div className="h-56 animate-pulse rounded-xl bg-surface-2/50" />
    </div>
  );
}
