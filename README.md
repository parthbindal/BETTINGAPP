# EDGEWISE

**Understand the Numbers. Find the Edge.**

An AI-powered educational and analytical intelligence platform for prediction
markets and sports statistics. EDGEWISE helps an ordinary person learn to read
market prices, probabilities, projections and risk, with every number carrying
its source, freshness and uncertainty.

> EDGEWISE is **not** a sportsbook or betting exchange. It does not place
> wagers, hold funds, or promise returns. It is an educational and analytical
> tool. Users can use every educational feature without ever placing a bet.
> Must be 18+. If gambling is a problem, call or text 1-800-GAMBLER.

---

## What's built

A complete, integrated product, not a set of demo screens:

| Area | What it does |
|---|---|
| **Overview** | Personalized dashboard: live market stats, featured markets, movers, upcoming games, watchlist changes, learning progress, rule-based recommendations, an interactive probability explorer. |
| **Market Intelligence** | Real Kalshi public-API markets across every category, with implied probability, spread, liquidity, resolution rules, settlement sources, candle history, recent trades, and a transparent heuristic model estimate with confidence and inputs. |
| **Sports Analytics** | Player profiles, projection analysis (distribution, hit rates by window, home/away and defense splits, Wilson intervals, minutes-trend flags, blended probability) and matchup intelligence. Ships with clearly-labeled fictional demo data. |
| **AI Analyst** | A streaming research assistant (Anthropic tool-use) that retrieves data, cites source and freshness, separates facts from estimates, flags uncertainty, and says what it doesn't know. Falls back to a labeled rule-based mode when no API key is set. |
| **Opportunity Scanner** | Surfaces model-vs-market gaps (net of fees), big moves, closing-soon markets, projection gaps and data-quality warnings. Conservative by design: nothing is ever called a "winner". |
| **Research Center** | AI (or rule-based) structured reports with executive summary, probability analysis, counterarguments, catalysts, risks, data quality, confidence and sources. Plus a daily/weekly market research summary. |
| **Learning Academy** | 3 courses, 20 lessons, beginner to advanced, with interactive examples (implied probability, EV, variance, sample size, calibration, Monte Carlo, Kelly, Bayes), quizzes, progress tracking, streaks and achievements. |
| **Performance Tracker** | Locked, tamper-proof forecasts scored with Brier, log loss and calibration curves, compared against the market price recorded at forecast time. Resolved from the exchange / data provider, never by hand. |
| **Watchlist** | Follow markets, players, teams, games, stat categories and topics, with configurable, non-pressuring alerts. |
| **Community** | Method-focused discussions with a touting filter (no guaranteed-win claims, no selling picks). |
| **Subscriptions** | Free and one paid plan — **Pro ($19.99/mo)** — with honest feature gating, Stripe checkout + billing portal, verified webhooks, complimentary grants, and a transparent referral reward. |
| **Admin** | Real-database metrics (MRR, ARR, conversion, churn, AI cost and margin), user management, data-provider health, AI usage, feature-limit overrides, and content management. |
| **Public site** | SEO landing page, pricing, five free calculator tools, and educational articles. |

---

## Tech stack

- **Next.js 16** (App Router, Cache Components, Turbopack) · React 19 · TypeScript
- **Tailwind CSS v4** · shadcn/ui (Base UI) · Recharts
- **Prisma 7** with driver adapters — SQLite for local dev, PostgreSQL for production
- **Better Auth** — email/password, 18+ age gate, admin plugin, account deletion
- **Stripe** — subscriptions, billing portal, verified webhooks
- **Anthropic SDK** — streaming tool-use analyst and structured-output reports
- **Resend** (optional) — onboarding sequence and research digests

Design: dark-first premium fintech surface (deep charcoal, navy tint, electric-blue
accent). Chart colors use a colorblind-validated categorical palette; every data
point is labeled live / delayed / historical / demo / estimate.

---

## Getting started

```bash
npm install                 # also generates the Prisma client (postinstall)
cp .env.example .env         # a dev .env is already created with safe defaults
npm run db:migrate           # create the SQLite schema (prisma/dev.db)
npm run db:seed              # fictional demo sports + full Kalshi market sync (~1 min)
npm run dev                  # http://localhost:3000
```

The app is fully usable immediately: Kalshi market data needs **no credentials**,
and sports runs on labeled demo data. Everything else degrades honestly when a
credential is missing (see below).

To make yourself an admin, set `ADMIN_EMAILS` in `.env` to your sign-up email
(comma-separated for several), then create the account.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop / build / serve |
| `npm run typecheck` · `lint` · `test` | TypeScript · ESLint · unit tests (`node:test`) |
| `npm run db:migrate` · `db:seed` · `db:studio` · `db:reset` | Prisma workflows |
| `npm run sync:markets` | Full Kalshi market scan from the CLI |
| `npm run stripe:setup` | Create the Pro product/price in your Stripe account |
| `npm run db:use-postgres` / `db:use-sqlite` | Switch the datasource provider |

---

## Configuration — every integration is optional

`src/lib/env.ts` exposes `is*Configured` flags that drive honest UI states
instead of pretending. Nothing is faked and no one is ever charged unless the
relevant service is genuinely configured.

| Variable(s) | Unlocks | When unset |
|---|---|---|
| *(none)* | **Kalshi market data** — public read-only API | — (always works) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | **AI Analyst** and AI reports | Clearly-labeled **rule-based mode** (deterministic, data-only) |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY` | **Checkout & billing** | Pricing page renders; checkout disabled; **no charge possible** |
| `STRIPE_WEBHOOK_SECRET` | Subscription state sync | Webhook endpoint returns 503 |
| `RESEND_API_KEY`, `EMAIL_FROM` | **Email** onboarding + digests | Messages are **logged as skipped**, never silently lost |
| `BALLDONTLIE_API_KEY` | Reserved for a future live sports adapter | Sports stays labeled **demo data** (the adapter isn't built yet) |
| `CRON_SECRET` | Authorizes the scheduled-job endpoints | Jobs run only via an admin session |
| `ADMIN_EMAILS` | Grants the admin role on sign-up | No admins |
| `BETTER_AUTH_SECRET` | Session signing (pre-filled in dev `.env`) | Required in production |

**Secrets are server-only.** No secret key is ever referenced in client code.

### AI cost control

The analyst streams with prompt caching (frozen system prompt), `effort: "medium"`,
and bounded tool iterations; reports use structured outputs. Every call records
token usage and estimated USD cost (`AiUsage`), surfaced in Admin → System with a
gross-margin figure. Set `ANTHROPIC_MODEL=claude-haiku-5-5` to cut cost for
high-volume free traffic.

---

## Scheduled jobs

Hit `POST /api/jobs/<name>` with `Authorization: Bearer $CRON_SECRET` (or run them
from Admin → System). Suggested cadence:

| Job | Does | Cadence |
|---|---|---|
| `sync-markets` | Full Kalshi scan; cache active markets, close departed ones, record snapshots | every 30 min |
| `refresh-hot` | Re-quote the most liquid + all watched markets (few batched calls) | every 5 min |
| `watchlist-alerts` | Notify on watched-market moves and upcoming events | every 15 min |
| `resolve-predictions` | Score forecasts from exchange results; finalize demo games | hourly |
| `onboarding-emails` | Advance the 6-step onboarding sequence | hourly |
| `daily-brief` / `weekly-brief` | Build the research summary and send opted-in digests | daily / weekly |

The market cache also self-heals: pages trigger a background refresh (via `after()`)
when the cache is stale, so the app stays fresh in development without a scheduler.

---

## Going to production (PostgreSQL)

```bash
npm run db:use-postgres                 # flip the Prisma provider
# set DATABASE_URL to your Postgres connection string
rm -rf prisma/migrations
npx prisma migrate dev --name init      # provider-specific migration
npm run db:seed
```

The same `src/lib/db.ts` picks the correct driver adapter from the connection
string, so no code changes are needed. Security headers (CSP, HSTS, frame-deny,
nosniff) are set in `next.config.ts`; `src/proxy.ts` does the optimistic auth
redirect; every API route authenticates, rate-limits and validates input with Zod.

---

## Architecture notes

- **Modular data providers** (`src/lib/data/providers/`) behind normalized types
  with provenance, so a licensed sports feed can be added as one adapter.
- **Transparent models**: the market model (`calib-v0.1`) and projection model
  (`proj-v0.1`) are documented heuristics, never presented as truth. Confidence
  is driven by liquidity, spread, sample size and variance; gaps are shown net of
  fees and labeled a research prompt, not an opportunity.
- **Integrity**: forecasts are immutable once created and resolved only from
  provider data; the `(app)` routes read the session and render per-user data, so
  they're declared `instant = false` (blocking) with a streamed `loading.tsx`.
- **Pure, tested analytics** (`src/lib/analytics/`): odds, EV, fees, scoring rules
  (Brier / log loss / calibration), distributions and intervals, covered by
  `tests/analytics.test.ts`.

All market data is Kalshi's public data, displayed for educational analysis.
EDGEWISE is not affiliated with Kalshi, PrizePicks, DraftKings, FanDuel or Polymarket.
