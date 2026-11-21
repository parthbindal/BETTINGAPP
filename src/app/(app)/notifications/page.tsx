import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { relative, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const session = await requireUser("/notifications");
  const items = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Updates about the markets, players and teams you follow."
        actions={
          <>
            <Link href="/settings/notifications" className="text-xs text-primary hover:underline">
              Preferences
            </Link>
            {unread > 0 && (
              <ActionButton href="/api/notifications" body={{ all: true }} successMessage="All notifications marked as read">
                Mark all read
              </ActionButton>
            )}
          </>
        }
      />
      {items.length ? (
        <ul className="card-surface divide-y divide-border/60">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-primary/5")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-surface-3" : "bg-primary")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  {n.href ? (
                    <Link href={n.href} className="text-sm font-medium hover:text-primary">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{n.title}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {titleCase(n.type)} · {relative(n.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
              </div>
              {!n.readAt && (
                <ActionButton href="/api/notifications" body={{ id: n.id }} variant="ghost" size="xs">
                  Mark read
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Bell />} title="No notifications yet" description="Follow markets, players or teams on your watchlist to be told when something changes." />
      )}
    </div>
  );
}
