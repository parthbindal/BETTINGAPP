"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_ITEMS, isActivePath, pageTitle } from "./nav-config";
import { useAccount } from "./account-chrome";

function NavRow({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          active && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_2px_0_0_0_var(--primary)]",
        )}
      >
        <Icon className={cn("size-4 text-muted-foreground group-hover:text-foreground", active && "text-primary")} />
        {label}
      </Link>
    </li>
  );
}

function NavList({ pathname, isAdmin }: { pathname: string | null; isAdmin: boolean }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Primary">
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{g.label}</div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.filter((n) => n.group === g.key).map((n) => (
              <NavRow key={n.href} href={n.href} label={n.label} icon={n.icon} active={isActivePath(pathname, n.href)} />
            ))}
            {g.key === "account" && isAdmin && <NavRow href="/admin" label="Admin" icon={ShieldCheck} active={isActivePath(pathname, "/admin")} />}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Reads the pathname, so it suspends on routes with unknown dynamic params. Always render inside <Suspense>. */
export function SidebarNav() {
  const pathname = usePathname();
  const me = useAccount();
  return <NavList pathname={pathname} isAdmin={me?.user?.role === "admin"} />;
}

/** Same markup without an active item, safe for the static shell. */
export function SidebarNavFallback() {
  return <NavList pathname={null} isAdmin={false} />;
}

export function PageTitle() {
  const pathname = usePathname();
  return <>{pageTitle(pathname)}</>;
}
