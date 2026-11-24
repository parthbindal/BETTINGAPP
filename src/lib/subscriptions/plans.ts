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
  /** Smart-money alerts (in the app, and on Telegram where configured). Free members get the public channel, an hour later. */
  smartAlerts: boolean;
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
  /** What the plan is for, in a few lines: the smart-money features people pay for. Pricing cards lead with these. */
  highlights: string[];
  /** The rest of the research toolkit, listed smaller under the highlights. */
  toolkit: string[];
}

/** Completed per deployment by planHighlights(): where alerts are delivered depends on what is switched on. */
const ALERTS_LINE = "Alerts when top traders make big moves";

export const PLANS: Record<Tier, Plan> = {
  free: {
    tier: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "See where the top traders agree.",
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
      smartAlerts: false,
      customReports: false,
      earlyAccess: false,
    },
    highlights: ["The 3 biggest smart-money signals, with who holds them", "The smart money map", "The top 25 traders, ranked live", "Polymarket's hottest traders today, this week and this month"],
    toolkit: [
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
    tagline: "Every signal and every big move by the top traders.",
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
      smartAlerts: true,
      customReports: true,
      earlyAccess: true,
    },
    highlights: ["Every signal, with deep dives on who holds what", ALERTS_LINE, "Follow traders and hear about their $1K+ trades", "All 1,000 top traders, ranked live, with their open bets", "Everything in Free"],
    toolkit: [
      "150 AI Analyst queries per day",
      "Full market intelligence (2,000 markets per category)",
      "2 years of historical charts",
      "Opportunity Scanner with enhanced filters",
      "Price Lab — cross-venue line shopping & +EV",
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

/** What this deployment has switched on. Telegram copy appears only when it is real, never as a promise. */
export interface DeliveryChannels {
  telegram: boolean; // members can connect a chat
  channel: boolean; // the free public channel exists
}

/** A plan's highlights for this deployment: Telegram lines only where Telegram is configured. */
export function planHighlights(tier: Tier, on: DeliveryChannels): string[] {
  const out = PLANS[tier].highlights.map((h) => (h === ALERTS_LINE ? `${ALERTS_LINE}, ${on.telegram ? "in the app and on Telegram" : "in the app"}` : h));
  if (tier === "free" && on.channel) out.splice(1, 0, "Public whale-alert channel on Telegram, an hour after Pro");
  return out;
}

/** The comparison table for this deployment (see planHighlights). */
export function featureMatrix(on: DeliveryChannels): typeof FEATURE_MATRIX {
  return FEATURE_MATRIX.map((row) =>
    row.label === "Whale alerts" ? { ...row, free: on.channel ? "Public Telegram channel, an hour later" : "—", pro: on.telegram ? "In the app and on Telegram" : "In the app" } : row,
  );
}

/** Subscription statuses that still carry the plan's features. */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/**
 * The plan a subscription row actually grants right now: a paid tier while its
 * status is active, until a complimentary grant's end date. One definition,
 * shared by page gating (getEntitlements) and background jobs (alert fan-out).
 */
export function effectiveTier(sub: { tier: string; status: string; source: string; currentPeriodEnd: Date | null } | null | undefined, now = Date.now()): Tier {
  if (!sub || !isTier(sub.tier) || !ACTIVE_STATUSES.has(sub.status)) return "free";
  const expired = sub.source === "complimentary" && sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() < now;
  return expired ? "free" : sub.tier;
}

/** Feature comparison rows for the pricing page. */
export const FEATURE_MATRIX: Array<{ label: string; free: string; pro: string }> = [
  // What people pay for comes first; the research toolkit follows.
  { label: "Smart-money signals", free: "Top 3 + money map", pro: "All, with deep dives" },
  { label: "Whale alerts", free: "—", pro: "In the app" },
  { label: "Top traders leaderboard", free: "Top 25, ranked live", pro: "All 1,000, with their open bets" },
  { label: "Whale Watch (top-trader tracking)", free: "—", pro: "Included" },
  { label: "AI Analyst queries / day", free: "5", pro: "150" },
  { label: "Saved research reports / month", free: "1", pro: "50" },
  { label: "Market history", free: "7 days", pro: "2 years" },
  { label: "Markets per category", free: "40", pro: "2,000" },
  { label: "Watchlist items", free: "5", pro: "250" },
  { label: "Opportunity scanner", free: "—", pro: "Enhanced filters" },
  { label: "Price Lab (cross-venue best odds)", free: "—", pro: "Included" },
  { label: "Sports analytics", free: "Basic stats", pro: "Advanced + matchups" },
  { label: "Performance tracker", free: "Accuracy only", pro: "Brier, calibration, skill" },
  { label: "Learning Academy", free: "Beginner", pro: "All levels" },
  { label: "Custom notifications & templates", free: "—", pro: "Included" },
  { label: "Data provenance & disclaimers", free: "Always", pro: "Always" },
];
