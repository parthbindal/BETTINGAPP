import { Suspense } from "react";
import { SubNav, SubNavFallback, type SubNavItem } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/shared/page-header";

const ITEMS: SubNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/system", label: "System" },
  { href: "/admin/limits", label: "Limits" },
  { href: "/admin/content", label: "Content" },
];

/** Every admin page calls requireAdmin(); this layout is only chrome. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Administration" title="Admin" description="Business metrics, users, data providers, limits and content. All figures are read from the database." />
      <Suspense fallback={<SubNavFallback items={ITEMS} />}>
        <SubNav items={ITEMS} />
      </Suspense>
      {children}
    </div>
  );
}
