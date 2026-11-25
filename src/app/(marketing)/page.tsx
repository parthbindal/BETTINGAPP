import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { ArrowRight, Check } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { ParticleLogo } from "@/components/marketing/particle-logo";
import { FaqItem, MovesLedger } from "@/components/marketing/home-blocks";
import { ConsensusLedger } from "@/components/intel/consensus-ledger";
import { TraderProfitList } from "@/components/intel/trader-profit-list";
import { CountUp } from "@/components/motion/count-up";
import { StatBand } from "@/components/shared/stat-band";
import { PLANS, planHighlights, type Tier } from "@/lib/subscriptions/plans";
import { config } from "@/lib/env";
import { getPublicBigMovesCached, getSmartMoneyPreviewCached, getTrackRecordCached, CONSENSUS_MIN_WALLETS } from "@/lib/data/public-cache";
import { MEANINGFUL_SAMPLE } from "@/lib/signals";
// Absolute UTC stamps only. relative() reads the clock, and "3 hours ago" on a
// page that claims to be a record is weaker evidence than a time.
import { dateShort, pct, utcStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The front door, set in the public track record's language (see
 * (marketing)/track-record/page.tsx): a claim, one live figure that carries its
 * denominator, a ruled stat band, then ledgers of real data. The visitor sees
 * the instrument itself instead of a description of it, and the record of
 * calls made before their results sits near the top, not at the bottom.
 *
 * Every number is read from the scan or the ledger at request time, inside a
 * Suspense hole (io()); the static shell around them is prerendered.
 */

/** Telegram appears in the copy only on a deployment where it is switched on. */
const delivery = { telegram: config.isTelegramConfigured, channel: config.isTelegramChannelConfigured };

const signalHref = (h: { tokenId: string }) => `/consensus/${h.tokenId}`;

const RULES: Array<{ head: string; body: string }> = [
  { head: "Rank the traders", body: "We read Polymarket's public all-time profit leaderboard and track the 1,000 most profitable wallets on it. The list is fixed by Polymarket's numbers, not picked by us." },
  { head: "Read every open position", body: "Each wallet's open bets of $100 or more come from Polymarket's public data, re-read every hour: the market, the side, the size, what they paid and the price now." },
  { head: "Flag where they agree", body: `When ${CONSENSUS_MIN_WALLETS} or more of those wallets hold the same side of a market still in play, it becomes a signal. Markets where top traders sit on both sides are shown as split, never as agreement.` },
  { head: "Publish the call before the result", body: "Every signal is written to the public ledger at the price it traded that minute and never edited. Polymarket's settlement grades it, wins and losses alike." },
];

/* ---------------------------------------------------------------- pieces */

/** A section heading at the track record's scale: the heading and one sentence of method, outside the data. */
function Heading({ eyebrow, title, children, right }: { eyebrow?: string; title: string; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="label-micro mb-3">{eyebrow}</div>}
        <h2 className="max-w-2xl text-balance text-2xl font-semibold sm:text-3xl">{title}</h2>
        {children && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>}
      </div>
      {right}
    </div>
  );
}

function Pending({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface px-6 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

const Bone = ({ className }: { className: string }) => <div className={cn("animate-pulse rounded bg-surface-3", className)} />;

/* ------------------------------------------------------------------ hero */

/** The hero's one figure: the money behind today's consensus, with who holds it and when it was read. */
async function HeroFigure() {
  await io();
  const s = await getSmartMoneyPreviewCached().catch(() => null);
  if (!s) {
    return (
      <div className="mt-12 max-w-md">
        <div className="label-micro">Money behind today&apos;s consensus</div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The first scan of Polymarket&apos;s top 1,000 traders is running. This figure appears when it finishes, usually within a few minutes; the scan then repeats every hour.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-12">
      <div className="label-micro">Money behind today&apos;s consensus</div>
      {/* The same rows the ledger below lists (in play, no split markets), so the hero and the table never disagree. */}
      <div className="figure-hero mt-2 text-foreground">
        <CountUp value={s.liveCapital} format="usd" id="home-capital" />
        <span className="figure-unit"> on {s.liveCount} live signals</span>
      </div>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Each one held by {CONSENSUS_MIN_WALLETS} or more of the {s.trackedWallets.toLocaleString("en-US")} traders we track, on the same side of a market still in play. Read from Polymarket <span className="font-medium text-foreground">{utcStamp(s.generatedAt)}</span>.
      </p>
    </div>
  );
}

function HeroFigureSkeleton() {
  return (
    <div className="mt-12 space-y-3" aria-busy="true">
      <Bone className="h-2.5 w-44" />
      <Bone className="h-20 w-72" />
      <Bone className="h-3 w-80" />
    </div>
  );
}

/* ------------------------------------------------------------- stat band */

async function HomeBand() {
  await io();
  const [s, view] = await Promise.all([getSmartMoneyPreviewCached().catch(() => null), getTrackRecordCached().catch(() => null)]);
  const r = view?.record;
  const onRecord = r ? r.open + r.settled + r.voided : null;
  const nextClose = view?.open.find((x) => x.endDate !== null)?.endDate ?? null;
  return (
    <StatBand
      stats={[
        { label: "Top traders tracked", value: s ? s.trackedWallets.toLocaleString("en-US") : "—", foot: "Polymarket's most profitable, all-time" },
        { label: "Open bets mapped", value: s ? s.positionsAnalyzed.toLocaleString("en-US") : "—", foot: "Positions of $100 or more, re-read hourly" },
        { label: "Calls on the record", value: onRecord !== null ? onRecord.toLocaleString("en-US") : "—", foot: "Each logged at its price, before the result" },
        {
          label: "Graded so far",
          value: r ? r.settled.toLocaleString("en-US") : "—",
          foot: !r ? "Ledger unavailable right now" : r.settled > 0 ? `${r.won} won · ${r.lost} lost${r.voided ? ` · ${r.voided} void` : ""}` : nextClose ? `First close ${dateShort(nextClose)}` : "As Polymarket settles them",
        },
      ]}
    />
  );
}

function BandSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2.5 px-5 py-5 sm:px-6">
          <Bone className="h-2.5 w-24" />
          <Bone className="h-9 w-24" />
          <Bone className="h-2.5 w-36" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- consensus */

async function TodaysConsensus() {
  await io();
  const s = await getSmartMoneyPreviewCached().catch(() => null);
  if (!s || !s.signals.length) {
    return (
      <Pending title="No clear agreement right now">
        A signal appears when {CONSENSUS_MIN_WALLETS} or more of the top traders hold the same side of a market that is still in play. The scan re-reads every wallet each hour{s ? `; the last read was ${utcStamp(s.generatedAt)}` : ""}.
      </Pending>
    );
  }
  const more = Math.max(0, s.liveCount - s.signals.length - s.locked.length);
  return (
    <ConsensusLedger
      label="Today's consensus among Polymarket's top traders"
      rows={s.signals}
      locked={s.locked}
      tracked={s.trackedWallets}
      href={signalHref}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5 sm:px-5">
          <p className="text-sm text-muted-foreground">
            A free account opens the top {s.signals.length} in full, with every trader in them.{" "}
            {s.locked.length > 0 && (
              <>
                Pro opens all <span className="font-medium text-foreground">{s.liveCount}</span>
                {more > 0 ? `, ${more} more than listed here` : ""}.
              </>
            )}
          </p>
          <LinkButton href="/sign-up" size="sm">
            Start free <ArrowRight className="size-3.5" />
          </LinkButton>
        </div>
      }
    />
  );
}

function LedgerSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-surface divide-y divide-border/40" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 px-5 py-4">
          <div className="w-full max-w-md space-y-2">
            <Bone className="h-3.5 w-4/5" />
            <Bone className="h-2.5 w-1/3" />
          </div>
          <Bone className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------- big moves, top traders */

async function MovesAndTraders() {
  await io();
  const [moves, s] = await Promise.all([getPublicBigMovesCached(6).catch(() => []), getSmartMoneyPreviewCached().catch(() => null)]);
  const where = delivery.telegram ? "in the app and on Telegram" : "in the app";
  return (
    <div className="space-y-16">
      <div className="min-w-0">
        <Heading title="Big moves by top traders" right={<span className="label-micro">Shown 1 hour late</span>}>
          Trades of $10,000 or more by the tracked wallets in the last day, one per trader. Pro members get them as alerts {where} when they happen.
        </Heading>
        <div className="mt-6">
          {moves.length ? (
            <MovesLedger moves={moves} />
          ) : (
            <Pending title="No $10,000+ moves in the last day">
              Top traders sometimes go a day without a trade that size. Every trade of $5,000 or more on Polymarket is checked about every 20 minutes, and the biggest by tracked wallets are listed here an hour after they happen.
            </Pending>
          )}
        </div>
      </div>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="min-w-0">
          <div className="label-micro">Who they are</div>
          <h2 className="mt-3 max-w-xl text-balance text-2xl font-semibold sm:text-3xl">
            The {s ? `${s.trackedWallets.toLocaleString("en-US")} ` : ""}most profitable traders on Polymarket, <span className="text-muted-foreground">ranked by Polymarket.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The list comes from Polymarket&apos;s own public profit leaderboard, so nobody here is hand-picked. Open any of them to see every bet they hold, what they paid and how it is going, and follow the ones you trust.
          </p>
        </div>
        <div className="card-surface min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">All-time profit on Polymarket</span>
            <span className="label-micro">Top {s?.topTraders.length ?? 0}</span>
          </div>
          {s?.topTraders.length ? (
            <TraderProfitList traders={s.topTraders} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">The ranking appears when the first scan finishes, usually within a few minutes.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- track record */

async function RecordBand() {
  await io();
  const view = await getTrackRecordCached().catch(() => null);
  if (!view) return null;
  const r = view.record;
  const graded = r.settled > 0;
  const nextClose = view.open.find((x) => x.endDate !== null)?.endDate ?? null;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
      <div>
        <div className="label-micro">Public track record</div>
        <h2 className="mt-3 text-balance text-2xl font-semibold sm:text-3xl">
          Every call on the record, <span className="text-muted-foreground">before the result.</span>
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Each signal is written down at the price it traded that minute and never edited. When Polymarket settles the market, the result is published beside it, wins and misses alike. The hit rate is always shown next to what the market itself expected, because that gap is the only number that shows skill.
        </p>
        <LinkButton href="/track-record" variant="outline" className="mt-7">
          See every call <ArrowRight className="size-4" />
        </LinkButton>
      </div>
      <div className="card-surface overflow-hidden">
        <StatBand
          columns={2}
          stats={[
            { label: "Calls graded", value: String(r.settled), foot: graded ? `${r.won} won · ${r.lost} lost${r.voided ? ` · ${r.voided} void` : ""}` : `${r.open} open${nextClose ? `, first close ${dateShort(nextClose)}` : ""}` },
            { label: "Hit rate", value: pct(r.hitRate), foot: graded ? `${r.won} of ${r.settled} settled${r.provisional ? ` · provisional until ${MEANINGFUL_SAMPLE}` : ""}` : "Shown once calls settle" },
            { label: "Market baseline", value: pct(graded ? r.baseline : r.openBaseline), foot: graded ? "What the entry prices implied" : `What the market expects of the ${r.open} open calls` },
            { label: "Calls open", value: String(r.open), foot: "Waiting on Polymarket to settle" },
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export default function LandingPage() {
  return (
    <div>
      <section className="hero-glow relative isolate overflow-hidden border-b border-border/60">
        <div aria-hidden="true" className="grid-rule pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-14 pb-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rise-in min-w-0">
            <div className="flex items-center gap-2">
              <span className="pulse-live" aria-hidden="true" />
              <span className="label-micro">Live Polymarket data · analysis only, no bets</span>
            </div>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl md:text-6xl">
              Follow the smart money. <span className="text-muted-foreground sm:block">See where the top 1,000 agree.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
              EDGEWISE reads every open bet held by Polymarket&apos;s most profitable traders, every hour. When {CONSENSUS_MIN_WALLETS} or more of them back the same side, you see it: the money behind it, what they paid, and a public record of how those calls turn out.
            </p>
            <Suspense fallback={<HeroFigureSkeleton />}>
              <HeroFigure />
            </Suspense>
            <div className="mt-10 flex flex-wrap gap-3">
              <LinkButton href="/sign-up" size="lg">
                Start free <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton href="#consensus" variant="ghost" size="lg">
                See today&apos;s consensus
              </LinkButton>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free plan, no card needed · Pro is ${PLANS.pro.priceMonthly} a month, cancel any time</p>
          </div>
          {/* The mark, demoted to the hero's right edge on wide screens. On a phone the headline and the live figure come first. */}
          <div className="hidden lg:block" aria-hidden="true">
            <ParticleLogo className="w-[320px]" />
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Suspense fallback={<BandSkeleton />}>
            <HomeBand />
          </Suspense>
        </div>
      </section>

      <section id="consensus" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <Heading title="Today's consensus" right={<span className="label-micro">Ranked by money at risk</span>}>
          The biggest bets where {CONSENSUS_MIN_WALLETS} or more of the top traders hold the same side of a market still in play. Decided markets and ones where top traders sit on both sides are left out.
        </Heading>
        <div className="mt-6">
          <Suspense fallback={<LedgerSkeleton rows={8} />}>
            <TodaysConsensus />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <Suspense fallback={<LedgerSkeleton rows={6} />}>
          <MovesAndTraders />
        </Suspense>
      </section>

      <section className="border-y border-border/60 bg-surface-1/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Suspense fallback={<div className="h-72" />}>
            <RecordBand />
          </Suspense>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="label-micro">How it works</div>
        <h2 className="mt-3 max-w-2xl text-balance text-2xl font-semibold sm:text-3xl">From a thousand wallets to one call on the record</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Nothing here is modelled, estimated or back-tested. Every figure is read from Polymarket&apos;s public data and links back to its market.</p>
        <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {RULES.map((r, i) => (
            <li key={r.head} className="flex gap-4">
              <span className="figure mt-0.5 shrink-0 text-sm font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-base font-semibold">{r.head}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border/60 bg-surface-1/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Heading eyebrow="Pricing" title="Start free. Go Pro for every signal." />
          <div className="mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {(Object.keys(PLANS) as Tier[]).map((tier) => {
              const p = PLANS[tier];
              const pro = tier === "pro";
              return (
                <div key={tier} className={cn("card-surface flex flex-col p-7", pro && "ring-1 ring-foreground/15")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="label-micro">{p.name}</h3>
                    <span className="flex items-baseline gap-1">
                      <span className="figure text-4xl font-semibold">{p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                    {planHighlights(tier, delivery).map((h) => (
                      <li key={h} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden="true" /> {h}
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
          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            Also inside: the AI Analyst, Price Lab, Opportunity Scanner, NBA analytics and the Academy.{" "}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
              Compare every feature
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-balance text-2xl font-semibold sm:text-3xl">Questions</h2>
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

      <section className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="max-w-2xl text-balance text-2xl font-semibold sm:text-3xl">
            Follow the smart money, <span className="text-muted-foreground">with the receipts.</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Free to start. Every figure is sourced and timestamped, and there is nothing to bet. 18+.</p>
          <LinkButton href="/sign-up" size="lg" className="mt-8">
            Create your free account <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
