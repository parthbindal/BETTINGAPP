import { Suspense } from "react";
import { SubNav, SubNavFallback, type SubNavItem } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/shared/page-header";

const ITEMS: SubNavItem[] = [
  { href: "/settings/subscription", label: "Subscription" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your plan, billing, profile and notification preferences." />
      <Suspense fallback={<SubNavFallback items={ITEMS} />}>
        <SubNav items={ITEMS} />
      </Suspense>
      {children}
    </div>
  );
}
