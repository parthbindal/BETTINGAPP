import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { ArrowRight, Check, Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { ParticleLogo } from "@/components/marketing/particle-logo";
import { AlertCard, BigMoveRow, FaqItem, ProductFrame } from "@/components/marketing/home-blocks";
import { HeroSignal, SignalCard } from "@/components/intel/signal";
import { TraderProfitList } from "@/components/intel/trader-profit-list";
import { PLANS, planHighlights, type Tier } from "@/lib/subscriptions/plans";
import { config } from "@/lib/env";
import { getPublicBigMovesCached, getSmartMoneyPreviewCached, getTrackRecordCached, CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { compact, pct, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Telegram appears in the copy only on a deployment where it is switched on. */
const delivery = { telegram: config.isTelegramConfigured, channel: config.isTelegramChannelConfigured };

const STEPS = [
  { title: "Rank the traders", body: "We read Polymarket's public profit leaderboard and track the 1,000 most profitable wallets on it." },
  { title: "Map every position", body: "Each wallet's open bets come from Polymarket's data: the market, the side, the size, what they paid and the price now." },
  { title: "Find the overlap", body: `When ${CONSENSUS_MIN_WALLETS} or more of those traders hold the same side of a market, it becomes a signal, with the money behind it.` },
  { title: "Check before you act", body: "A signal is a research prompt, not a sure thing. Every figure links to its market so you can verify it. EDGEWISE never places bets." },
];

const signalHref = (tokenId: string) => `/consensus/${tokenId}`;

/* ---------------------------------------------------------------- hero */

function FrameSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface-1/95 p-5" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-3" />
      <div className="mt-6 h-[22rem] animate-pulse rounded-xl bg-surface-2/70" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-2/50" />
        ))}
      </div>
    </div>
  );
}

/** A slice of the real app: today's biggest signal and the latest big moves, from live data. */
async function LiveProduct() {
  await io();
  const [s, moves] = await Promise.all([getSmartMoneyPreviewCached().catch(() => null), getPublicBigMovesCached().catch(() => [])]);
  const featured = s?.signals[0];
  return (
    <ProductFrame address="edgewise · home" status={s ? `Live data · scanned ${relative(s.generatedAt)}` : "Waiting for the first scan"} live={Boolean(s)}>
      <div className="space-y-5 p-3 sm:p-5">
        <div className="min-w-0">
          <div className="label-micro mb-3 px-1">Biggest bet the top traders agree on</div>
          {featured ? (
            <HeroSignal
              h={featured}
              href={signalHref(featured.tokenId)}
              action={
                <LinkButton href="/sign-up" variant="outline" className="w-full">
                  See every trader in this bet <ArrowRight className="size-4" />
                </LinkButton>
              }
            />
          ) : (
            <div className="card-surface px-6 py-16 text-center text-sm text-muted-foreground">Signals appear here after EDGEWISE finishes its first scan of Polymarket&apos;s top traders.</div>
          )}
        </div>
        <section aria-label="Recent big moves by top traders">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="label-micro">Big moves by top traders</h2>
            <span className="text-[11px] text-muted-foreground">Shown 1 hour late · Pro members get them as alerts first</span>
          </div>
          {moves.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {moves.slice(0, 4).map((m) => (
                <BigMoveRow key={m.id} m={m} />
              ))}
            </ul>
          ) : (
            <p className="card-surface p-5 text-sm text-muted-foreground">No $10K+ moves by top traders in the last day.</p>
          )}
        </section>
      </div>
    </ProductFrame>
  );
}

/* --------------------------------------------------------------- strip */

function StripSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 px-1 py-7 lg:px-6">
          <div className="h-2.5 w-24 animate-pulse rounded bg-surface-3" />
          <div className="h-8 w-24 animate-pulse rounded bg-surface-3" />
        </div>
      ))}
    </div>
  );
}

/** Headline numbers from the latest Polymarket scan. */
async function SmartMoneyStrip() {
  await io();
  const s = await getSmartMoneyPreviewCached().catch(() => null);
  const stats = [
    { label: "Top traders tracked", value: s ? s.trackedWallets.toLocaleString("en-US") : "—", note: "Polymarket's most profitable, all-time" },
    { label: "Open bets mapped", value: s ? s.positionsAnalyzed.toLocaleString("en-US") : "—", note: "Positions of $100 or more, rescanned hourly" },
    { label: "Signals right now", value: s ? `${s.consensusOutcomes}${s.consensusCapped ? "+" : ""}` : "—", note: `${CONSENSUS_MIN_WALLETS}+ top traders on the same side` },
    { label: "Money in those signals", value: s ? `$${compact(s.consensusCapital)}` : "—", note: "Combined value on those outcomes" },
  ];
  return (
    <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-border">
      {stats.map((st) => (
        <div key={st.label} className="px-1 py-7 lg:px-6">
          <dt className="label-micro">{st.label}</dt>
          <dd className="figure mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{st.value}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{st.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------- pillars */

function Pillar({ id, eyebrow, title, body, points, visual, reverse = false }: { id: string; eyebrow: string; title: string; body: React.ReactNode; points: string[]; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn("min-w-0", reverse && "lg:order-2")}>
        <div className="label-micro">{eyebrow}</div>
        <h3 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h3>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">{body}</p>
        <ul className="mt-6 space-y-2.5 text-[15px]">
          {points.map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("min-w-0", reverse && "lg:order-1")}>{visual}</div>
    </div>
  );
}

function PillarsSkeleton() {
  return <div className="h-[60rem] animate-pulse rounded-2xl bg-surface-1/60" aria-busy="true" />;
}

async function Pillars() {
  await io();
  const [s, moves] = await Promise.all([getSmartMoneyPreviewCached().catch(() => null), getPublicBigMovesCached().catch(() => [])]);
  const cards = s?.signals.slice(1, 3) ?? [];
  const locked = s ? Math.max(0, s.consensusOutcomes - s.freeTokenCount) : 0;
  // The hero frame already shows the newest four; the alert stack uses the next ones when there are enough.
  const alerts = (moves.length >= 7 ? moves.slice(4, 7) : moves.slice(0, 3)).slice(0, 3);
  const where = delivery.telegram ? "in the app and on Telegram" : "in the app";

  return (
    <div className="space-y-28">
      <Pillar
        id="signals"
        eyebrow="Signals"
        title="See where the best traders agree."
        body={`When ${CONSENSUS_MIN_WALLETS} or more of Polymarket's top 1,000 traders hold the same side of a market, it becomes a signal: who is in, how much money, what they paid and where the price is now.`}
        points={["Ranked by the money at risk", "A deep dive on every trader in the bet", "One-trader bets and split markets called out, never headlined"]}
        visual={
          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map((h) => (
              <SignalCard key={h.tokenId} h={h} href={signalHref(h.tokenId)} />
            ))}
            {locked > 0 && (
              <Link href="/sign-up" className="card-surface lift group flex flex-col items-center justify-center gap-2 p-6 text-center sm:col-span-2">
                <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium group-hover:text-primary">
                  {locked} more {locked === 1 ? "signal" : "signals"} right now in Pro
                </span>
                <span className="text-xs text-muted-foreground">The 3 biggest are free with an account</span>
              </Link>
            )}
          </div>
        }
      />

      <Pillar
        id="alerts"
        reverse
        eyebrow="Whale alerts"
        title="Know when a whale makes a move."
        body="EDGEWISE watches every trade of $5,000 or more on Polymarket and tells you when one of the top traders makes a big move, or when a trader you follow trades $1,000 or more."
        points={[`Alerts ${where}`, "Choose the size and how high up the leaderboard", "Follow any trader to hear about all their bets"]}
        visual={
          alerts.length ? (
            <div className="relative mx-auto max-w-md">
              <div aria-hidden="true" className="absolute inset-x-10 -inset-y-6 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]" />
              <div className="space-y-3">
                {alerts.map((m, i) => (
                  <AlertCard key={m.id} m={m} className={cn(i === 1 && "sm:ml-8", i === 2 && "sm:ml-4 opacity-80")} />
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">Real alerts from the last day, shown an hour late. Pro members get them first.</p>
            </div>
          ) : (
            <div className="card-surface p-8 text-center text-sm text-muted-foreground">No big moves by top traders in the last day.</div>
          )
        }
      />

      <Pillar
        id="traders"
        eyebrow="Top traders"
        title="Track the 1,000 most profitable traders."
        body="Ranks and profit update live from Polymarket's leaderboard. Open any trader to see what they hold, how their open bets are doing, and every big move they make."
        points={["Live ranks, straight from Polymarket", "Every open bet, with what they paid", "Today's hottest traders, flagged when they are proven"]}
        visual={
          s?.topTraders.length ? (
            <div className="card-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">All-time profit on Polymarket</span>
                <span className="label-micro">Top 6 of 1,000</span>
              </div>
              <TraderProfitList traders={s.topTraders} />
            </div>
          ) : (
            <div className="card-surface p-8 text-center text-sm text-muted-foreground">The leaderboard fills in after the first scan.</div>
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------- track record */

async function RecordBand() {
  await io();
  const view = await getTrackRecordCached().catch(() => null);
  if (!view) return null;
  const r = view.record;
  const onRecord = r.open + r.settled + r.voided;
  return (
    <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <div className="label-micro">Public track record</div>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Every call on the record, before the result.</h2>
        <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Each signal is written down with the price it traded at that minute, and never edited. When Polymarket settles the market, we publish what happened, wins and misses alike.
        </p>
        <LinkButton href="/track-record" variant="outline" className="mt-7">
          See the public record <ArrowRight className="size-4" />
        </LinkButton>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
        <div className="bg-card p-5">
          <dt className="label-micro">Calls on record</dt>
          <dd className="figure mt-2 text-4xl font-semibold">{onRecord.toLocaleString("en-US")}</dd>
        </div>
        <div className="bg-card p-5">
          <dt className="label-micro">Graded so far</dt>
          <dd className="figure mt-2 text-4xl font-semibold">{r.settled.toLocaleString("en-US")}</dd>
        </div>
        <div className="col-span-2 bg-card p-5 text-sm text-muted-foreground">
          {r.settled > 0 && r.hitRate !== null ? (
            <>
              <span className="text-foreground">
                {r.won} won, {r.lost} lost
              </span>{" "}
              so far{r.baseline !== null ? `; the market had priced them at ${pct(r.baseline)}` : ""}.{r.provisional ? " Too few yet to call it skill." : ""}
            </>
          ) : (
            <>No call has been graded yet. Results go up as Polymarket settles each market, wins and misses alike.</>
          )}
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export default function LandingPage() {
  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[980px] bg-[radial-gradient(720px_420px_at_50%_22%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%),radial-gradient(560px_340px_at_62%_46%,color-mix(in_oklch,var(--brand-violet)_10%,transparent),transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_24%,black,transparent_62%)]" />

        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-4 text-center sm:px-6 sm:pt-6">
          <ParticleLogo className="w-[min(300px,66vw)]" />
          <div className="rise-in -mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand-cyan" aria-hidden="true" />
            Live Polymarket data · <span className="hidden sm:inline">analysis only,&nbsp;</span>no bets
          </div>
          <h1 className="rise-in mt-6 text-balance text-5xl font-semibold tracking-[-0.04em] sm:text-7xl" style={{ animationDelay: "80ms" }}>
            Follow the Smart Money.
          </h1>
          <p className="rise-in mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl" style={{ animationDelay: "160ms" }}>
            See what Polymarket&apos;s 1,000 most profitable traders are betting on right now: where they agree, what they just bought, and how it is going.
          </p>
          <div className="rise-in mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
            <LinkButton href="/sign-up" size="lg">
              Start free <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton href="#live" size="lg" variant="outline">
              See it live
            </LinkButton>
          </div>
          <p className="rise-in mt-4 text-xs text-muted-foreground" style={{ animationDelay: "320ms" }}>
            Free plan, no card needed · Pro is ${PLANS.pro.priceMonthly} a month, cancel any time
          </p>
        </div>

        <div id="live" className="mx-auto mt-16 w-full max-w-6xl scroll-mt-20 px-4 sm:px-6">
          <Suspense fallback={<FrameSkeleton />}>
            <LiveProduct />
          </Suspense>
        </div>

        <div className="mt-16 border-y border-border bg-surface-1/60">
          <Suspense fallback={<StripSkeleton />}>
            <SmartMoneyStrip />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-28 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="label-micro">What you get</div>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Three ways to follow the money.</h2>
        </div>
        <div className="mt-20">
          <Suspense fallback={<PillarsSkeleton />}>
            <Pillars />
          </Suspense>
        </div>
      </section>

      <section className="border-y border-border bg-surface-1/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <Suspense fallback={<div className="h-64" />}>
            <RecordBand />
          </Suspense>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <div className="label-micro">How it works</div>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From a thousand wallets to one clear read.</h2>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="bg-card p-6">
              <div className="tabular font-mono text-xs text-muted-foreground">0{i + 1}</div>
              <div className="mt-3 font-medium">{step.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border bg-surface-1/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="label-micro">Pricing</div>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Start free. Go Pro for every signal.</h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
            {(Object.keys(PLANS) as Tier[]).map((tier) => {
              const p = PLANS[tier];
              const pro = tier === "pro";
              return (
                <div key={tier} className={cn("card-surface flex flex-col p-7", pro && "border-primary/40 glow-primary")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{p.name}</h3>
                    <span className="flex items-baseline gap-1">
                      <span className="figure text-4xl font-semibold">{p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                    {planHighlights(tier, delivery).map((h) => (
                      <li key={h} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> {h}
                      </li>
                    ))}
                  </ul>
                  <LinkButton href={pro ? "/pricing" : "/sign-up"} variant={pro ? "default" : "outline"} className="mt-7 w-full">
                    {pro ? "Get Pro" : "Start free"}
                  </LinkButton>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
            Also inside: the AI Analyst, Price Lab, Opportunity Scanner, NBA analytics and the Academy.{" "}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
              Compare every feature
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-24 sm:px-6">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
        <div className="mt-8 border-t border-border">
          <FaqItem q="Does EDGEWISE place bets for me?">
            No. EDGEWISE is research only. It never places bets, holds money or connects to a Polymarket account. Every signal links to its market on Polymarket so you can check it yourself.
          </FaqItem>
          <FaqItem q="Where does the data come from?">
            Polymarket&apos;s public data: its profit leaderboard, each top trader&apos;s open positions, and their trades, which are recorded on-chain. Nothing is estimated or made up, and every figure can be checked on Polymarket.
          </FaqItem>
          <FaqItem q="How fresh is it?">
            Ranks and profit come live from Polymarket&apos;s leaderboard, which Polymarket itself recalculates about once an hour. Every top trader&apos;s open bets are rescanned every hour, and big trades are checked about every 20 minutes.
          </FaqItem>
          <FaqItem q="Will following the smart money make me money?">
            Nobody can promise that. Top traders lose too, and several can end up on the same side for unrelated reasons. That is why every call is logged before the result on the public track record, wins and misses alike.
          </FaqItem>
          <FaqItem q="Can I cancel Pro?">Yes, any time, from Settings. Pro stays on until the end of the month you paid for.</FaqItem>
          <FaqItem q="Who is EDGEWISE for?">Adults 18 and over who want to understand prediction markets. It is educational and is not financial advice.</FaqItem>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
          <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Follow the smart money, with the receipts.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Free to start. Every figure is sourced and timestamped, and there is nothing to bet. 18+.</p>
          <LinkButton href="/sign-up" size="lg" className="mt-8">
            Create your free account <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
