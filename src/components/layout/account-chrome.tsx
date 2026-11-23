"use client";

import Link from "next/link";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Bell, Sparkles } from "lucide-react";
import { UserMenu } from "./user-menu";
import { TierBadge } from "@/components/shared/badges";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, type Tier } from "@/lib/subscriptions/plans";

/** Member chrome data returned by GET /api/me. */
export interface Me {
  signedIn: boolean;
  user?: { name: string; email: string; role: string };
  tier?: Tier;
  unread?: number;
}

const AccountContext = createContext<Me | null>(null);

async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Me) : { signedIn: false };
  } catch {
    return { signedIn: false };
  }
}

/**
 * Loads member chrome (name, plan, unread count) after hydration. Keeping this
 * out of the server render is what lets the app shell prerender as a static
 * shell. Refreshes when the window regains focus and every two minutes.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchMe().then((data) => {
        if (alive) setMe(data);
      });
    };
    load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, 120_000);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      window.clearInterval(timer);
    };
  }, []);
  return <AccountContext value={me}>{children}</AccountContext>;
}

export function useAccount(): Me | null {
  return use(AccountContext);
}

export function NotificationsBell() {
  const unread = useAccount()?.unread ?? 0;
  return (
    <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
      <Bell className="size-4" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>
      )}
    </Link>
  );
}

/** Plan summary and account menu at the foot of the sidebar. */
export function AccountFooter() {
  const me = useAccount();
  if (!me) return <div className="h-14" aria-hidden />;
  if (!me.signedIn || !me.user) return null;
  const tier = me.tier ?? "free";
  return (
    <>
      {tier === "free" ? (
        <Link href="/pricing" className="mb-3 block rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs hover:bg-primary/15">
          <div className="flex items-center gap-1.5 font-medium text-primary">
            <Sparkles className="size-3.5" /> Upgrade to Pro
          </div>
          <p className="mt-1 text-muted-foreground">Alerts when top traders make big moves, every signal with deep dives, and {PLANS.pro.limits.aiQueriesPerDay} AI questions a day.</p>
        </Link>
      ) : (
        <div className="mb-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>Plan</span> <TierBadge tier={tier} />
        </div>
      )}
      <UserMenu name={me.user.name} email={me.user.email} tier={tier} />
    </>
  );
}

/** Compact account button for narrow screens. */
export function MobileAccount() {
  const me = useAccount();
  if (!me?.signedIn || !me.user) return null;
  return <UserMenu name={me.user.name} email={me.user.email} tier={me.tier ?? "free"} compact />;
}
