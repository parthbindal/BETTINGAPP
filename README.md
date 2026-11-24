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
| `npm run telegram:setup -- --url https://your-site` | Check the alert bot, register its webhook, check the public channel |
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
| `ALERTS_CRON_SECRET` | Lets an outside scheduler start `smart-alerts` (and nothing else) | Alerts run only after page views |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | **Smart-money alerts on Telegram** (Pro members connect a chat) | Alerts still arrive in the app; Settings says Telegram is not switched on |
| `TELEGRAM_CHANNEL_ID` | The **free public alert channel** (`@name`): the biggest moves, an hour late | No public channel |
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

In production these run themselves: `vercel.json` declares a cron for every job
below. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when a
`CRON_SECRET` env var is set, which is exactly what the route checks — so the
only setup is having that variable present in the Vercel project.

You can still fire any job by hand from Admin → System, or with
`POST /api/jobs/<name>` and the same bearer token.

**The schedules are daily because this project is on Vercel Hobby.** Hobby
allows each cron to run at most once a day, and it does not just skip a more
frequent cron: it **fails the whole deployment**. (Sub-daily schedules here once
blocked every deploy for a day.) Do not add a sub-daily schedule unless the
project is on Pro.

| Job | Does | Cron (UTC) |
|---|---|---|
| `whale-watch` | Rescan the top 1,000 all-time Polymarket traders — the smart-money data the app is built on | hourly via the `smart-alerts` tick; daily 06:02 as a floor |
| `sync-markets` | Full Kalshi scan; cache active markets, close departed ones, record snapshots | daily 07:14 |
| `score-signals` | Grade ledger signals whose markets have settled | daily 08:26 |
| `resolve-predictions` | Score forecasts from exchange results | daily 09:38 |
| `refresh-hot` | Re-quote the most liquid + all watched markets | daily 10:44 |
| `watchlist-alerts` | Notify on watched-market moves and upcoming events | daily 11:52 |
| `smart-alerts` | Big trades by the tracked traders → in-app + Telegram alerts, public channel | every 20 min from cron-job.org (see below) |
| `daily-brief` / `weekly-brief` | Build the research summary and send opted-in digests | daily / weekly |
| `onboarding-emails` | Advance the 6-step onboarding sequence | daily 15:19 |

**Freshness does not depend on the daily crons.** The whale scan runs about
hourly whether or not anyone visits: every `smart-alerts` tick (every 20
minutes, below) and every smart-money page view (Home, Signals, Live Trades,
Top Traders, Smart Money) checks the stored scan and, once it is an hour old,
rescans after the response with `after()`. Whoever asks first claims the run
in the `JobRun` table (src/lib/job-runs.ts), so several Vercel instances can
never scan at once (three once started within 30 seconds) and scans never run
more than about hourly, however many visitors or refresh buttons ask. A Pro
member's "Refresh now" may rescan once the last scan is 30 minutes old.

**Top Traders is live without the scan.** Its ranks and all-time profit are
read by the browser straight from Polymarket's public leaderboard
(`data-api.polymarket.com` allows any origin), every 2 minutes while the tab is
visible: the top 50 (4 KB), and the full top 1,000 (72 KB) only when the top 50
changed or every 10 minutes. That costs no function call and never wakes the
database. Polymarket recalculates its own board periodically (it held still for
20+ minutes at a time when measured), so a figure changes when theirs does.
Open bets, ROI and exposure still come from the hourly scan, and the page says
when that was.

### Smart-money alerts

`smart-alerts` (src/lib/smart-alerts.ts) reads the newest $5K+ trades across all
of Polymarket in one call (`/v2/trades` with `filterType=CASH`, both sides of
every fill), keeps the tracked top 1,000 and anyone a member follows, merges a
trader's fills on one outcome within 30 minutes into one alert, and tells each
Pro member whose settings match (Settings → Notifications: size, rank, followed
traders) in the app and, once they connect it, on Telegram. The biggest moves
($50K+) go to the public channel an hour later. Every write is idempotent
(`SmartAlert.key`, `SmartAlertDelivery` unique per alert/member/channel), so
overlapping runs never alert anyone twice.

How often it runs is set by two free tiers, not one:

- **Vercel Hobby** cannot run sub-daily crons (they fail every deploy), so the
  schedule comes from outside: a free [cron-job.org](https://cron-job.org) job
  calls `https://<site>/api/jobs/smart-alerts` every **20 minutes** with the
  header `Authorization: Bearer $ALERTS_CRON_SECRET`. That secret can start
  this job only. Page views run alerts (`keepAlertsFlowing`) only as a
  fallback, once no run has started for 25 minutes.
- **Neon Free** is the real limit. Every run wakes the database, Neon bills
  each wake as at least 5 minutes of compute, and Free includes 100
  compute-hours a month; running out suspends the database, and so the
  site, until the next month. Every 20 minutes is about 45 of those hours;
  every 10 is about 90 (too close); every 2 would never let it sleep. Runs
  less than 4 minutes apart are skipped as a safety net, across every server
  instance (the `JobRun` claim).
- **Alerts within about 2 minutes** need a database that may stay awake (a
  paid Neon plan). Vercel Pro alone does not fix this.

**Telegram setup:** create a bot with @BotFather; create a public channel and
add the bot as an admin with "Post messages"; put `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`) and
`TELEGRAM_CHANNEL_ID` in `.env` and in the Vercel project; redeploy; then run
`npm run telegram:setup -- --url https://your-site`. Members connect from
Settings → Notifications (a one-time link, valid 15 minutes).

### Free-tier budget

Vercel Hobby includes **4 hours of active CPU a month**; going over pauses the
project. Measured costs (Nov 2026, on a Mac; Vercel's CPUs are somewhat slower):

| Work | CPU each | How often | Per month |
|---|---|---|---|
| Whale scan (1,000 wallets, ~1,100 calls) | ~3 s local, ~5 s on Vercel | at most hourly (claim) | ~1 h |
| Smart-money alerts run | ~0.55 s local, ~0.8 s on Vercel | every 20 min | ~0.5 h |
| Live leaderboard | none on our side | browser to Polymarket | 0 |

Before the claim, page views could start a scan every 15 minutes and alerts
every 90 seconds on every instance; under steady traffic either alone would
have used up the 4 hours. Positions are read with Polymarket's own value filter
(`filterType=CASH&filterAmount=100`), which cut a scan's CPU by a third and
removed a 200-row cap that undercounted the busiest wallets (one held 845
positions of $100+). The filter times out (503 after ~5 s) for wallets holding
hundreds of worthless leftovers; those are read from the plain list instead,
which is sorted by value, so reading stops once a page ends below $100.

Deploying this needs the `JobRun` table: run `npx prisma migrate deploy`
before pushing. Without it, jobs still run, just unclaimed as before.

`whale-watch` crawls a thousand wallets and is declared `maxDuration = 300`
(available on Hobby with Fluid compute). There is no Polymarket feed that pushes
"this trader's portfolio changed", so positions are crawled wallet by wallet and
the floor is however long a full scan takes — minutes, not seconds.

Neither Polymarket API the app uses (`gamma-api` for markets,
`data-api` for the leaderboard and wallet positions) takes a key, so there is no
credential to configure for any of this.

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
