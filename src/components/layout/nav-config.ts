import { Activity, Bot, FileText, GitMerge, GraduationCap, LayoutDashboard, LineChart, Radar, Scale, Settings, Star, Target, Trophy, Users, Volleyball, Wallet, Waves, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "intelligence" | "research" | "account";
}

/** Consumer core first (plain names), then the analyst tools, then the account. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Home", icon: LayoutDashboard, group: "intelligence" },
  { href: "/consensus", label: "Signals", icon: GitMerge, group: "intelligence" },
  { href: "/activity", label: "Live Trades", icon: Activity, group: "intelligence" },
  { href: "/leaderboard", label: "Top Traders", icon: Trophy, group: "intelligence" },
  { href: "/wallets", label: "Wallet Lookup", icon: Wallet, group: "intelligence" },
  { href: "/markets", label: "Markets", icon: LineChart, group: "intelligence" },
  { href: "/watchlist", label: "Watchlist", icon: Star, group: "intelligence" },
  { href: "/whales", label: "Smart Money Deep Dive", icon: Waves, group: "research" },
  { href: "/scanner", label: "Opportunity Scanner", icon: Radar, group: "research" },
  { href: "/compare", label: "Price Lab", icon: Scale, group: "research" },
  { href: "/analyst", label: "AI Analyst", icon: Bot, group: "research" },
  { href: "/sports", label: "NBA", icon: Volleyball, group: "research" },
  { href: "/research", label: "Reports", icon: FileText, group: "research" },
  { href: "/tracker", label: "My Predictions", icon: Target, group: "research" },
  { href: "/academy", label: "Learn", icon: GraduationCap, group: "research" },
  { href: "/community", label: "Community", icon: Users, group: "research" },
  { href: "/settings/subscription", label: "Plan & Settings", icon: Settings, group: "account" },
];

export const NAV_GROUPS: Array<{ key: NavItem["group"]; label: string }> = [
  { key: "intelligence", label: "Follow the money" },
  { key: "research", label: "Tools" },
  { key: "account", label: "Account" },
];

export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href.startsWith("/settings")) return pathname.startsWith("/settings");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string | null): string {
  if (!pathname) return "EDGEWISE";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/notifications")) return "Notifications";
  const hit = NAV_ITEMS.filter((n) => isActivePath(pathname, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.label ?? "EDGEWISE";
}
