/**
 * Subscription tiers and entitlements. EDGEWISE has one paid plan — Pro —
 * which unlocks the full product. Limits gate volume and depth, never basic
 * transparency: disclaimers, data provenance, resolution rules and beginner
 * education are available on every tier.
 */
export type Tier = "free" | "pro";

export interface PlanLimits {
  aiQueriesPerDay: number;
  reportsPerMonth: number;
  watchlistMax: number;
  marketHistoryDays: number;
  marketListLimit: number;
  scanner: boolean;
  scannerAdvancedFilters: boolean;
  academyLevels: Array<"beginner" | "intermediate" | "advanced">;
  performanceTracker: "basic" | "full" | "advanced";
  sportsDepth: "basic" | "full" | "advanced";
  matchupIntelligence: boolean;
  advancedModels: boolean;
  customNotifications: boolean;
  customReports: boolean;
  earlyAccess: boolean;
}

export interface Plan {
  tier: Tier;
  name: string;
  priceMonthly: number;
  tagline: string;
  purpose: string;
  limits: PlanLimits;
  highlights: string[];
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    tier: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Learn the fundamentals and explore real markets.",
    purpose: "Acquire users and demonstrate value.",
    limits: {
      aiQueriesPerDay: 5,
      reportsPerMonth: 1,
      watchlistMax: 5,
      marketHistoryDays: 7,
      marketListLimit: 40,
      scanner: false,
      scannerAdvancedFilters: false,
      academyLevels: ["beginner"],
      performanceTracker: "basic",
      sportsDepth: "basic",
      matchupIntelligence: false,
      advancedModels: false,
      customNotifications: false,
      customReports: false,
      earlyAccess: false,
    },
    highlights: [
      "Dashboard with live market overview",
      "Browse 40 markets per category",
      "Basic player statistics",
      "5 AI Analyst questions per day",
      "Beginner Academy courses",
      "Watchlist of 5 items",
      "7 days of market history",
      "All probability explanations and disclaimers",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceMonthly: 19.99,
    tagline: "The complete analyst toolkit.",
    purpose: "The subscription product — the full platform.",
    limits: {
      aiQueriesPerDay: 150,
      reportsPerMonth: 50,
      watchlistMax: 250,
      marketHistoryDays: 730,
      marketListLimit: 2000,
      scanner: true,
      scannerAdvancedFilters: true,
      academyLevels: ["beginner", "intermediate", "advanced"],
      performanceTracker: "advanced",
      sportsDepth: "advanced",
      matchupIntelligence: true,
      advancedModels: true,
      customNotifications: true,
      customReports: true,
      earlyAccess: true,
    },
    highlights: [
      "Everything in Free",
      "150 AI Analyst queries per day",
      "Full market intelligence (2,000 markets per category)",
      "2 years of historical charts",
      "Opportunity Scanner with enhanced filters",
      "Price Lab — cross-venue line shopping & +EV",
      "Whale Watch — top-trader position tracking",
      "Full sports analytics with matchup reports",
      "50 saved research reports per month",
      "Advanced performance tracker (Brier, calibration, skill vs market)",
      "Intermediate and advanced Academy courses",
      "Custom notifications and research templates",
      "Watchlist of 250 items",
    ],
  },
};

export const TIER_ORDER: Tier[] = ["free", "pro"];

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);
}

export function isTier(x: unknown): x is Tier {
  return x === "free" || x === "pro";
}

/** Feature comparison rows for the pricing page. */
export const FEATURE_MATRIX: Array<{ label: string; free: string; pro: string }> = [
  { label: "AI Analyst queries / day", free: "5", pro: "150" },
  { label: "Saved research reports / month", free: "1", pro: "50" },
  { label: "Market history", free: "7 days", pro: "2 years" },
  { label: "Markets per category", free: "40", pro: "2,000" },
  { label: "Watchlist items", free: "5", pro: "250" },
  { label: "Opportunity scanner", free: "—", pro: "Enhanced filters" },
  { label: "Price Lab (cross-venue best odds)", free: "—", pro: "Included" },
  { label: "Whale Watch (top-trader tracking)", free: "—", pro: "Included" },
  { label: "Sports analytics", free: "Basic stats", pro: "Advanced + matchups" },
  { label: "Performance tracker", free: "Accuracy only", pro: "Brier, calibration, skill" },
  { label: "Learning Academy", free: "Beginner", pro: "All levels" },
  { label: "Custom notifications & templates", free: "—", pro: "Included" },
  { label: "Data provenance & disclaimers", free: "Always", pro: "Always" },
];
