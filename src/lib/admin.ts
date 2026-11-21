import { db } from "@/lib/db";
import { PLANS, isTier } from "@/lib/subscriptions/plans";
import { config } from "@/lib/env";

export async function getAdminMetrics() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const [users, users30, activeSubs, canceled30, subsBreakdown, aiAgg, aiAgg30, usage7, errors24h, providers, featureUsage, activeUsers7, reports30] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.subscription.findMany({ where: { tier: "pro", status: { in: ["active", "trialing", "past_due"] } } }),
    db.subscription.count({ where: { status: "canceled", updatedAt: { gte: d30 } } }),
    db.subscription.groupBy({ by: ["tier", "source"], _count: { _all: true } }),
    db.aiUsage.aggregate({ _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, costUsd: true }, _count: { _all: true } }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: d30 } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    db.usageEvent.groupBy({ by: ["feature"], where: { createdAt: { gte: d7 } }, _count: { _all: true } }),
    db.errorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 86400_000) } } }),
    db.providerHealth.findMany(),
    db.usageEvent.groupBy({ by: ["feature"], _count: { _all: true } }),
    db.usageEvent.findMany({ where: { createdAt: { gte: d7 }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
    db.researchReport.count({ where: { createdAt: { gte: d30 } } }),
  ]);
  const paidStripe = activeSubs.filter((s) => s.source === "stripe");
  const mrr = paidStripe.reduce((a, s) => a + (isTier(s.tier) ? PLANS[s.tier].priceMonthly : 0), 0);
  const compMrrEquivalent = activeSubs.filter((s) => s.source === "complimentary").reduce((a, s) => a + (isTier(s.tier) ? PLANS[s.tier].priceMonthly : 0), 0);
  const paidUsers = activeSubs.length;
  const conversion = users ? paidUsers / users : 0;
  const churn = paidUsers + canceled30 ? canceled30 / (paidUsers + canceled30) : 0;
  const aiCost30 = aiAgg30._sum.costUsd ?? 0;
  // Infrastructure estimate: AI spend + placeholder hosting/db baseline, transparently labeled.
  const infraBaseline = 0; // set real figures in admin when known
  const grossMargin = mrr > 0 ? (mrr - aiCost30 - infraBaseline) / mrr : null;
  return {
    users,
    users30,
    paidUsers,
    mrr,
    arr: mrr * 12,
    compMrrEquivalent,
    conversion,
    churn,
    canceled30,
    subsBreakdown: subsBreakdown.map((s) => ({ tier: s.tier, source: s.source, count: s._count._all })),
    ai: {
      calls: aiAgg._count._all,
      calls30: aiAgg30._count._all,
      inputTokens: aiAgg._sum.inputTokens ?? 0,
      outputTokens: aiAgg._sum.outputTokens ?? 0,
      cacheReadTokens: aiAgg._sum.cacheReadTokens ?? 0,
      costUsd: aiAgg._sum.costUsd ?? 0,
      costUsd30: aiCost30,
      configured: config.isAiConfigured,
      model: config.anthropicModel,
    },
    grossMargin,
    activeUsers7: activeUsers7.length,
    reports30,
    errors24h,
    providers,
    featureUsage7: usage7.map((u) => ({ feature: u.feature, count: u._count._all })).sort((a, b) => b.count - a.count),
    featureUsageAll: featureUsage.map((u) => ({ feature: u.feature, count: u._count._all })).sort((a, b) => b.count - a.count),
    integrations: {
      stripe: config.isStripeConfigured,
      stripeWebhook: config.isStripeWebhookConfigured,
      email: config.isEmailConfigured,
      sportsLive: config.isSportsLiveConfigured,
      ai: config.isAiConfigured,
      database: config.isPostgres ? "postgresql" : "sqlite",
    },
  };
}

export async function getSignupsByDay(days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const users = await db.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), 0);
  for (const u of users) {
    const k = u.createdAt.toISOString().slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([x, y]) => ({ x: x.slice(5), y }));
}
