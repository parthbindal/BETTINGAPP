"use client";

import { Suspense, useState, type ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { SidebarNav, SidebarNavFallback, PageTitle } from "./sidebar-nav";
import { AccountFooter, AccountProvider, MobileAccount, NotificationsBell } from "./account-chrome";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Disclaimer } from "@/components/shared/page-header";

/**
 * Authenticated chrome. It makes no request-time reads of its own: member data
 * arrives through AccountProvider after hydration, and the pathname-dependent
 * pieces sit inside their own Suspense boundaries.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AccountProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 lg:flex">
          <div className="flex h-14 shrink-0 items-center px-4">
            <Logo href="/overview" />
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav />
            </Suspense>
          </div>
          <div className="shrink-0 border-t border-sidebar-border p-3">
            <AccountFooter />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur sm:px-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" />}>
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-14 items-center px-4">
                  <Logo href="/overview" />
                </div>
                {/* Close the drawer when any link inside it is followed. */}
                <div
                  className="px-3 py-2"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) setOpen(false);
                  }}
                >
                  <Suspense fallback={<SidebarNavFallback />}>
                    <SidebarNav />
                  </Suspense>
                </div>
                <div className="border-t border-sidebar-border p-3">
                  <AccountFooter />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1 truncate text-sm font-medium">
              <Suspense fallback="EDGEWISE">
                <PageTitle />
              </Suspense>
            </div>
            <LinkButton href="/markets?focus=search" variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
              <Search className="size-4" /> Search markets
            </LinkButton>
            <NotificationsBell />
            <div className="lg:hidden">
              <MobileAccount />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          <footer className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
            <Disclaimer />
          </footer>
        </div>
      </div>
    </AccountProvider>
  );
}
