"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SubNavItem {
  href: string;
  label: string;
}

function Tabs({ items, pathname }: { items: SubNavItem[]; pathname: string | null }) {
  return (
    <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border/60" aria-label="Section">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Render inside <Suspense fallback={<SubNavFallback … />}>: it reads the pathname. */
export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  return <Tabs items={items} pathname={pathname} />;
}

export function SubNavFallback({ items }: { items: SubNavItem[] }) {
  return <Tabs items={items} pathname={null} />;
}
