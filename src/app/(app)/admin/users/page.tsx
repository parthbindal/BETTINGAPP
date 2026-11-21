import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Section } from "@/components/shared/page-header";
import { TierBadge } from "@/components/shared/badges";
import { UserActions } from "@/components/admin/admin-forms";
import { isTier } from "@/lib/subscriptions/plans";
import { dateShort } from "@/lib/format";
import { insensitive } from "@/lib/data/markets";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const session = await requireAdmin();
  const q = sp.q?.trim();
  const [users, total] = await Promise.all([
    db.user.findMany({
      where: q ? { OR: [{ email: { contains: q, ...insensitive } }, { name: { contains: q, ...insensitive } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { subscription: true, _count: { select: { predictions: true, conversations: true, reports: true } } },
    }),
    db.user.count(),
  ]);
  return (
    <Section
      title="Users"
      description={`${users.length} shown of ${total.toLocaleString()}`}
      right={
        <form action="/admin/users" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or email" className="h-8 rounded-lg border border-input bg-surface-2/40 px-2.5 text-xs" />
          <button className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">Search</button>
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 font-medium">User</th>
              <th className="py-1.5 font-medium">Plan</th>
              <th className="py-1.5 font-medium">Role</th>
              <th className="hidden py-1.5 font-medium md:table-cell">Joined</th>
              <th className="hidden py-1.5 font-medium lg:table-cell">Activity</th>
              <th className="py-1.5 text-right font-medium">Manage</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const sub = u.subscription;
              const tier = sub && isTier(sub.tier) ? sub.tier : "free";
              return (
                <tr key={u.id} className="border-t border-border/50 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {u.name} {u.banned && <span className="ml-1 rounded border border-status-critical/40 px-1 text-[10px] text-status-critical">Banned</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="py-2">
                    <TierBadge tier={tier} />
                    <div className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                      {sub?.source && sub.source !== "none" ? sub.source : "—"}
                      {sub?.currentPeriodEnd ? ` · until ${dateShort(sub.currentPeriodEnd)}` : ""}
                      {sub?.status && sub.status !== "active" ? ` · ${sub.status}` : ""}
                    </div>
                  </td>
                  <td className="py-2 capitalize">{u.role ?? "user"}</td>
                  <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">{dateShort(u.createdAt)}</td>
                  <td className="hidden py-2 text-xs text-muted-foreground lg:table-cell">
                    {u._count.conversations} chats · {u._count.reports} reports · {u._count.predictions} forecasts
                  </td>
                  <td className="py-2">
                    <UserActions userId={u.id} isSelf={u.id === session.user.id} role={u.role ?? "user"} banned={Boolean(u.banned)} hasGrant={sub?.source === "complimentary"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Complimentary grants never charge the user and cannot be applied over an active Stripe subscription. Paid subscriptions are managed in Stripe.</p>
    </Section>
  );
}
