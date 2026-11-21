"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User, CreditCard } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { TierBadge } from "@/components/shared/badges";
import type { Tier } from "@/lib/subscriptions/plans";
import { cn } from "@/lib/utils";

export function UserMenu({ name, email, tier, compact = false }: { name: string; email: string; tier: Tier; compact?: boolean }) {
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-sidebar-accent", !compact && "w-full")} aria-label="Account menu" />}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary ring-1 ring-primary/30">{initials(name || email)}</span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span className="truncate text-xs">{email}</span>
            <TierBadge tier={tier} />
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/profile" />}>
          <User className="size-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/subscription" />}>
          <CreditCard className="size-4" /> Subscription
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/notifications" />}>
          <Settings className="size-4" /> Notifications
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
