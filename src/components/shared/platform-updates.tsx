import { db } from "@/lib/db";
import { dateShort } from "@/lib/format";

/** Recent platform updates, managed from the admin Content page. */
export async function PlatformUpdates({ limit = 4 }: { limit?: number }) {
  const updates = await db.platformUpdate.findMany({ orderBy: { publishedAt: "desc" }, take: limit });
  if (!updates.length) return <p className="text-xs text-muted-foreground">No updates published yet.</p>;
  return (
    <ul className="space-y-2.5">
      {updates.map((u) => (
        <li key={u.id} className="text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{u.title}</span>
            <span className="tabular shrink-0 text-muted-foreground">{dateShort(u.publishedAt)}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground">{u.body}</p>
        </li>
      ))}
    </ul>
  );
}
