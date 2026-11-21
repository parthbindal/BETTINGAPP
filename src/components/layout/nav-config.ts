import { Activity, Bot, FileText, GitMerge, GraduationCap, LayoutDashboard, LineChart, Radar, Scale, Settings, Star, Target, Trophy, Users, Volleyball, Wallet, Waves, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "intelligence" | "research" | "account";
}

/**
 * Smart-money intelligence first (the product's core), then the research
 * toolkit, then the account. Every existing page keeps a place here.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, group: "intelligence" },
  { href: "/whales", label: "Smart Money", icon: Waves, group: "intelligence" },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, group: "intelligence" },
  { href: "/wallets", label: "Wallet Explorer", icon: Wallet, group: "intelligence" },
  { href: "/consensus", label: "Consensus Trades", icon: GitMerge, group: "intelligence" },
  { href: "/scanner", label: "Market Scanner", icon: Radar, group: "intelligence" },
  { href: "/activity", label: "Activity Feed", icon: Activity, group: "intelligence" },
  { href: "/watchlist", label: "Watchlists", icon: Star, group: "intelligence" },
  { href: "/markets", label: "Market Intelligence", icon: LineChart, group: "research" },
  { href: "/compare", label: "Price Lab", icon: Scale, group: "research" },
  { href: "/analyst", label: "AI Analyst", icon: Bot, group: "research" },
  { href: "/sports", label: "Sports Analytics", icon: Volleyball, group: "research" },
  { href: "/research", label: "Research Center", icon: FileText, group: "research" },
  { href: "/academy", label: "Learning Academy", icon: GraduationCap, group: "research" },
  { href: "/tracker", label: "Performance Tracker", icon: Target, group: "research" },
  { href: "/community", label: "Community", icon: Users, group: "research" },
  { href: "/settings/subscription", label: "Subscription & Settings", icon: Settings, group: "account" },
];

export const NAV_GROUPS: Array<{ key: NavItem["group"]; label: string }> = [
  { key: "intelligence", label: "Intelligence" },
  { key: "research", label: "Research" },
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
