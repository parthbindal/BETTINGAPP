/**
 * Central, server-only view of configuration. Every integration is optional;
 * the `is*Configured` flags drive honest UI states ("Billing not configured",
 * "Rule-based analyst mode", "Demo sports data") instead of pretending.
 */
const env = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  kalshiApiBase: process.env.KALSHI_API_BASE ?? "https://api.elections.kalshi.com/trade-api/v2",
  balldontlieApiKey: process.env.BALLDONTLIE_API_KEY ?? "",
  // Requests/min the balldontlie sync is allowed. Free tier = 5, ALL-STAR = 60, GOAT = 600.
  balldontlieRpm: Math.max(1, Number(process.env.BALLDONTLIE_RPM ?? "5") || 5),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "EDGEWISE <hello@example.com>",
  cronSecret: process.env.CRON_SECRET ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  isProd: process.env.NODE_ENV === "production",
} as const;

export const config = {
  ...env,
  isAiConfigured: Boolean(env.anthropicApiKey),
  isStripeConfigured: Boolean(env.stripeSecretKey && env.stripePriceProMonthly),
  isStripeWebhookConfigured: Boolean(env.stripeWebhookSecret),
  isEmailConfigured: Boolean(env.resendApiKey),
  isSportsLiveConfigured: Boolean(env.balldontlieApiKey), // balldontlie live NBA adapter; demo fallback when empty
  isPostgres: env.databaseUrl.startsWith("postgres"),
};

export type AppConfig = typeof config;
