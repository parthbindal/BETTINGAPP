import { Suspense } from "react";
import { io } from "next/cache";
import { ArrowRight, ArrowUpRight, BarChart3, BookOpen, Bot, LineChart, ShieldCheck, Target } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { ParticleLogo } from "@/components/marketing/particle-logo";
import { PLANS } from "@/lib/subscriptions/plans";
import { getSmartMoneyPreviewCached, CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { cents, compact, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Rank the traders", body: "We read Polymarket's public profit leaderboard and track the 1,000 most profitable wallets on it." },
  { title: "Map every position", body: "Each wallet's open positions come from Polymarket's data API: the market, the side, the size, the average entry and the current price." },
  { title: "Find the overlap", body: `Positions are grouped by exact outcome. When ${CONSENSUS_MIN_WALLETS} or more tracked wallets hold the same side, it surfaces as consensus, with the capital behind it.` },
  { title: "Check before you act", body: "Agreement is a research prompt, not a trade signal. Every figure links back to its market so you can verify it. EDGEWISE never places wagers." },
];

const FEATURES = [
  { icon: LineChart, title: "Market Intelligence", body: "Live Kalshi markets with implied probability, spread, liquidity, resolution rules and a transparent heuristic model, every number with its source and timestamp." },
  { icon: Target, title: "Price Lab", body: "The same event on Kalshi and Polymarket side by side, re-quoted live, with de-vigged fair odds and the cheaper venue marked." },
  { icon: Bot, title: "AI Analyst", body: "Ask in plain English. It retrieves the data, cites the source, explains its reasoning and tells you what it does not know." },
  { icon: BarChart3, title: "Sports Analytics", body: "Real NBA teams and schedule, with projection analysis that shows sample sizes, variance and honest uncertainty bands." },
  { icon: BookOpen, title: "Learning Academy", body: "Beginner to advanced: implied probability, expected value, Bayesian reasoning, calibration, Monte Carlo and risk." },
  { icon: ShieldCheck, title: "Performance Tracker", body: "Locked predictions scored with Brier, log loss and calibration curves, compared against the market at the time." },
];

const polymarketUrl = (slug: string) => `https://polymarket.com/event/${slug}`;

function StripSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6" aria-busy="true">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 px-1 py-5 lg:px-6">
            <div className="h-2.5 w-24 animate-pulse rounded bg-surface-3" />
            <div className="h-7 w-20 animate-pulse rounded bg-surface-3" />
            <div className="h-2.5 w-36 animate-pulse rounded bg-surface-3/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Headline numbers from the latest Polymarket scan. Request-time, served from a short cache. */
async function SmartMoneyStrip() {
  await io();
  const s = await getSmartMoneyPreviewCached().catch(() => null);
  const stats = [
    { label: "Tracked wallets", value: s ? s.trackedWallets.toLocaleString("en-US") : "—", note: "Polymarket's top traders by profit" },
    { label: "Positions analyzed", value: s ? s.positionsAnalyzed.toLocaleString("en-US") : "—", note: "Open positions mapped in the latest scan" },
    { label: "Consensus outcomes", value: s ? `${s.consensusOutcomes}${s.consensusCapped ? "+" : ""}` : "—", note: `Held by ${CONSENSUS_MIN_WALLETS}+ tracked wallets at once` },
    { label: "Capital in consensus", value: s ? `$${compact(s.consensusCapital)}` : "—", note: "Combined value on those outcomes" },
  ];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <dl className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
        {stats.map((st) => (
          <div key={st.label} className="px-1 py-5 lg:px-6">
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{st.label}</dt>
            <dd className="tabular mt-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{st.value}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{st.note}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center gap-2 border-t border-border py-2.5 text-[11px] text-muted-foreground">
        <span className={cn("size-1.5 shrink-0 rounded-full", s ? "bg-status-good" : "bg-status-warning")} aria-hidden="true" />
        {s ? `Polymarket public data · scanned ${relative(s.generatedAt)} · refreshed by EDGEWISE in batches, not tick by tick` : "Waiting for the first Polymarket scan. Figures appear once it completes."}
      </p>
    </div>
  );
}

function ConsensusSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-10 w-12 animate-pulse rounded-lg bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-3/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The outcomes held by the most tracked wallets in the latest scan. */
async function ConsensusPreview() {
  await io();
  const s = await getSmartMoneyPreviewCached().catch(() => null);
  if (!s || !s.top.length) {
    return (
      <div className="px-6 py-14 text-center">
        <div className="text-sm font-medium">No scan yet</div>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">Consensus appears here after EDGEWISE completes its first scan of Polymarket&apos;s top wallets.</p>
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-border">
        {s.top.map((h) => (
          <li key={`${h.title}-${h.outcome}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50">
            <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-primary/25 bg-primary/10 py-1.5">
              <span className="tabular text-lg font-semibold leading-none text-foreground">{h.holders}</span>
              <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">wallets</span>
            </div>
            <div className="min-w-0 flex-1">
              {h.slug ? (
                <a href={polymarketUrl(h.slug)} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium hover:text-primary">
                  {h.title}
                  <ArrowUpRight className="ml-1 inline size-3.5 opacity-0 transition-opacity group-hover:opacity-70" aria-hidden="true" />
                </a>
              ) : (
                <div className="line-clamp-2 text-sm font-medium">{h.title}</div>
              )}
              <div className="tabular mt-1 text-xs text-muted-foreground">
                {h.category} · {(h.pctOfField * 100).toFixed(1)}% of tracked field · ${compact(h.totalValue)} held
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium">{h.outcome}</div>
              <div className="tabular mt-1 text-[11px] text-muted-foreground">at {cents(h.currentPrice)}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        Open positions at scan time ({relative(s.generatedAt)}). Prices are each outcome&apos;s current price on Polymarket.
      </p>
    </>
  );
}

export default function LandingPage() {
  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(620px_380px_at_50%_26%,rgb(22_139_255/0.13),transparent_70%),radial-gradient(480px_300px_at_60%_40%,rgb(129_91_255/0.08),transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_30%,black,transparent_68%)]" />

        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-14 pt-6 text-center sm:px-6 sm:pt-10">
          <ParticleLogo className="w-[min(400px,78vw)]" />
          <div className="rise-in -mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand-cyan shadow-[0_0_8px_var(--brand-cyan)]" aria-hidden="true" />
            Polymarket intelligence · <span className="hidden sm:inline">Analysis only,&nbsp;</span>no wagers
          </div>
          <h1 className="rise-in mt-6 text-balance text-5xl font-semibold tracking-[-0.035em] sm:text-7xl" style={{ animationDelay: "80ms" }}>
            Follow the Smart Money.
          </h1>
          <p className="rise-in mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "160ms" }}>
            Track elite Polymarket traders. Discover overlapping positions. Find the signals others miss.
          </p>
          <div className="rise-in mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
            <LinkButton href="/whales" size="lg">
              Explore Intelligence <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton href="#how-it-works" size="lg" variant="outline">
              See How It Works
            </LinkButton>
          </div>
        </div>

        <div className="border-y border-border bg-surface-1/70">
          <Suspense fallback={<StripSkeleton />}>
            <SmartMoneyStrip />
          </Suspense>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">How it works</div>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From a thousand wallets to one clear read.</h2>
          <p className="mt-3 text-muted-foreground">EDGEWISE reads Polymarket&apos;s public data, maps what its most profitable traders actually hold, and shows where they overlap, with the numbers to check it yourself.</p>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="bg-card p-6">
              <div className="tabular font-mono text-xs text-primary">0{i + 1}</div>
              <div className="mt-3 font-medium">{step.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-surface-1/60">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-cyan">Smart money consensus</div>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Where the best traders overlap, right now.</h2>
            <p className="mt-3 text-muted-foreground">The outcomes held by the most of Polymarket&apos;s top 1,000 wallets at the same time. Overlap shows where conviction sits. It does not promise a profit, and several wallets can land on the same side for unrelated reasons.</p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {["The exact outcome, not just the market", "Wallet count and share of the tracked field", "Combined capital and the outcome's current price"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
            <LinkButton href="/whales" variant="outline" className="mt-7">
              Open the full consensus board <ArrowRight className="size-4" />
            </LinkButton>
          </div>
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-30px_rgb(22_139_255/0.35)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Most-held outcomes</span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-status-good" aria-hidden="true" /> Live scan
              </span>
            </div>
            <Suspense fallback={<ConsensusSkeleton />}>
              <ConsensusPreview />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-balance text-2xl font-semibold tracking-tight">Everything else in EDGEWISE</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">The smart-money board sits inside a full research toolkit, honest about what it cannot know.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card p-6 transition-colors hover:bg-surface-2/60">
              <f.icon className="size-5 text-primary" aria-hidden="true" />
              <div className="mt-3 text-sm font-semibold">{f.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface-1/40">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Market says 60%. Model says 68%. Now what?</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              An 8-point gap is a research prompt, not a profit. EDGEWISE shows the spread, the liquidity, the approximate fees, the model&apos;s inputs and its confidence, then helps you ask the right questions. We never label anything a guaranteed opportunity.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {["Market price, implied probability and model estimate kept distinct", "Historical frequency and model confidence shown side by side", "Data freshness labeled: live, delayed, historical, demo, estimate", "Fees, spreads and calibration error accounted for"].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-surface p-6">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Plans</div>
            <div className="mt-4 grid gap-3">
              {Object.values(PLANS).map((p) => (
                <div key={p.tier} className="flex items-center justify-between rounded-lg border border-border bg-surface-2/40 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.tagline}</div>
                  </div>
                  <div className="tabular text-sm font-semibold">
                    {p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}
                    <span className="text-xs font-normal text-muted-foreground">/mo</span>
                  </div>
                </div>
              ))}
            </div>
            <LinkButton href="/pricing" className="mt-4 w-full" variant="outline">
              Compare every feature
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-balance text-3xl font-semibold tracking-tight">Follow the smart money, with the receipts.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">Free to start. Every figure is sourced and timestamped, and there is nothing to wager. 18+.</p>
          <LinkButton href="/sign-up" size="lg" className="mt-7">
            Create your free account <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
