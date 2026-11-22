import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { LinkButton } from "@/components/ui/link-button";
import { polymarketMarketUrl } from "@/lib/intel";
// Absolute dates only, never "6 days ago": a ledger's timestamps are its
// evidence, and relative time reads Date.now(), which blocks prerendering.
import { cents, dateShort, pct, pts } from "@/lib/format";
import { getTrackRecordCached } from "@/lib/data/public-cache";
import { MEANINGFUL_SAMPLE, type LedgerRow, type SignalRecord } from "@/lib/signals";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Track record",
  description: "Every consensus EDGEWISE has called, published at the price it was called at, graded against Polymarket settlement. Losses included.",
};

/**
 * The public ledger.
 *
 * This page exists because the honest answer to "does following smart money
 * work?" cannot be a testimonial. It has to be a list of calls made before the
 * results were known, with the losses still on it.
 *
 * The one design rule here: no figure appears without its denominator, and the
 * hit rate never appears without the market baseline beside it. A hit rate of
 * 83% on calls entered at an average of 83c is the market's opinion wearing our
 * name -- see MEANINGFUL_SAMPLE and SignalRecord.baseline in lib/signals.
 *
 * Data comes from getTrackRecordCached (cacheLife "minutes"); the route cannot
 * use `export const revalidate` because cacheComponents is on.
 */

/** Return at the price we called it, which is the only return a reader could have had. */
function rowReturn(r: LedgerRow): number | null {
  if (r.settlePrice === null || r.entryPrice <= 0) return null;
  return (r.settlePrice - r.entryPrice) / r.entryPrice;
}

const STATUS_LABEL: Record<string, string> = { won: "Won", lost: "Lost", void: "Void", open: "Open" };
const STATUS_CELL: Record<string, string> = { won: "cell-won", lost: "cell-lost", void: "cell-void", open: "cell-open" };

function Outcome({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex min-w-[3.75rem] items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide tabular", STATUS_CELL[status])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function MarketCell({ r }: { r: LedgerRow }) {
  const url = polymarketMarketUrl(r.eventSlug, r.marketSlug);
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        <span className="line-clamp-2 text-[13px] leading-snug text-foreground">{r.title}</span>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary" aria-label="Open on Polymarket">
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-secondary-foreground">{r.outcome}</span>
        <span aria-hidden>·</span>
        <span>{r.entryKind}</span>
      </div>
    </div>
  );
}

/** One stat in the hero band. `value` is already formatted; `foot` carries the denominator. */
function Stat({ label, value, foot, accent }: { label: string; value: string; foot: string; accent?: boolean }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="label-micro">{label}</div>
      <div className={cn("figure mt-2 text-3xl font-semibold sm:text-4xl", accent ? "text-primary" : "text-foreground")}>{value}</div>
      <div className="mt-1.5 text-xs leading-snug text-muted-foreground">{foot}</div>
    </div>
  );
}

function Hero({ record, nextSettlement }: { record: SignalRecord; nextSettlement: Date | null }) {
  const graded = record.settled > 0;
  return (
    <section className="hero-glow relative isolate overflow-hidden border-b border-border/60">
      <div aria-hidden className="grid-rule pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <div className="rise-in">
          <div className="flex items-center gap-2">
            <span className="pulse-live" aria-hidden />
            <span className="label-micro">Public ledger · re-scanned every 15 minutes</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl md:text-6xl">
            Every call on the record, <span className="text-muted-foreground">before the result.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            When the top 1,000 Polymarket wallets agree on an outcome, we write it down — the market, the side, and the price it was trading at that minute. We never touch that entry price again. Then Polymarket settles it and we publish what happened, wins and misses alike.
          </p>
        </div>

        <div className="mt-14">
          {graded ? (
            <div>
              <div className="label-micro">Hit rate</div>
              <div className="figure-hero mt-2 text-foreground">
                {pct(record.hitRate)}
                <span className="figure-unit"> of {record.settled} graded</span>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                The market priced these at {pct(record.baseline)}.{" "}
                <span className={cn("font-medium", (record.edge ?? 0) >= 0 ? "text-[color-mix(in_oklch,var(--status-good)_72%,white)]" : "text-[color-mix(in_oklch,var(--status-critical)_70%,white)]")}>{pts(record.edge)} of edge.</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="label-micro">Calls on the board</div>
              <div className="figure-hero mt-2 text-foreground">
                <CountUp value={record.open} id="tr-open" />
                <span className="figure-unit"> live</span>
              </div>
              <div className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                None have settled yet{nextSettlement ? <> — the first resolves <span className="font-medium text-foreground">{dateShort(nextSettlement)}</span></> : null}. Every one is listed below at the price it was called. Come back and check us.
              </div>
            </div>
          )}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/sign-up" size="lg">
            See today&apos;s consensus
          </LinkButton>
          <LinkButton href="#method" variant="ghost" size="lg">
            How this is scored
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

function StatBand({ record }: { record: SignalRecord }) {
  const graded = record.settled > 0;
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid divide-y divide-border/60 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          <Stat
            label="Calls graded"
            value={String(record.settled)}
            foot={graded ? `${record.won} won · ${record.lost} lost${record.voided ? ` · ${record.voided} void` : ""}` : `${record.open} open, awaiting settlement`}
          />
          <Stat label="Hit rate" value={pct(record.hitRate)} foot={graded ? `${record.won} of ${record.settled} settled calls` : "Shown once calls settle"} />
          <Stat
            label="Market baseline"
            value={pct(graded ? record.baseline : record.openBaseline)}
            foot={graded ? "What the entry prices implied" : `How often the market itself expects these ${record.open} to land`}
          />
          <Stat label="Edge vs. market" value={pts(record.edge)} foot={graded ? "Hit rate minus baseline" : "The only figure here that shows skill"} accent={graded} />
        </div>
      </div>
    </section>
  );
}

function ProvisionalNote({ record }: { record: SignalRecord }) {
  if (record.settled === 0 || !record.provisional) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
      <p className="rounded-lg border border-[color-mix(in_oklch,var(--status-warning)_30%,transparent)] bg-[color-mix(in_oklch,var(--status-warning)_8%,transparent)] px-4 py-3 text-sm text-secondary-foreground">
        <span className="font-medium">Too early to read anything into this.</span> {record.settled} of a target {MEANINGFUL_SAMPLE} calls have settled. Rates this early swing wildly on a single result, so treat them as a work in progress, not a claim.
      </p>
    </div>
  );
}

function OpenBoard({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">Open calls</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Live positions, soonest to settle first. These are published before anyone knows the answer — that is the whole point of showing them.</p>
        </div>
        <div className="label-micro">{rows.length} shown</div>
      </div>
      <div className="card-surface mt-6 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60">
                <th scope="col" className="label-micro px-5 py-3 font-medium">Market &amp; call</th>
                <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Called at</th>
                <th scope="col" className="label-micro px-5 py-3 text-right font-medium">On record since</th>
                <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Settles</th>
                <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="stagger-in divide-y divide-border/40">
              {rows.map((r, i) => (
                <tr key={r.id} style={{ "--i": i } as React.CSSProperties} className="transition-colors hover:bg-surface-2/60">
                  <td className="max-w-md px-5 py-3.5"><MarketCell r={r} /></td>
                  <td className="figure px-5 py-3.5 text-right text-base font-semibold">{cents(r.entryPrice)}</td>
                  <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">{dateShort(r.firstSeenAt)}</td>
                  <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">{r.endDate ? dateShort(r.endDate) : "No stated close"}</td>
                  <td className="px-5 py-3.5 text-right"><Outcome status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SettledBoard({ rows }: { rows: LedgerRow[] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
      <h2 className="text-2xl font-semibold sm:text-3xl">Settled calls</h2>
      {rows.length === 0 ? (
        <div className="card-surface mt-6 px-6 py-12 text-center">
          <p className="text-base font-medium">Nothing has settled yet.</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            The ledger started on 22 November 2026. This table fills itself in as markets close — graded against Polymarket&apos;s settlement price, not our own judgement, and losses are not quietly dropped.
          </p>
        </div>
      ) : (
        <div className="card-surface mt-6 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/60">
                  <th scope="col" className="label-micro px-5 py-3 font-medium">Market &amp; call</th>
                  <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Called at</th>
                  <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Settled</th>
                  <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Return</th>
                  <th scope="col" className="label-micro px-5 py-3 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="stagger-in divide-y divide-border/40">
                {rows.map((r, i) => {
                  const ret = rowReturn(r);
                  return (
                    <tr key={r.id} style={{ "--i": i } as React.CSSProperties} className="transition-colors hover:bg-surface-2/60">
                      <td className="max-w-md px-5 py-3.5"><MarketCell r={r} /></td>
                      <td className="figure px-5 py-3.5 text-right text-base font-semibold">{cents(r.entryPrice)}</td>
                      <td className="figure px-5 py-3.5 text-right text-base">{cents(r.settlePrice)}</td>
                      <td className={cn("figure px-5 py-3.5 text-right text-base font-semibold", ret === null ? "text-muted-foreground" : ret >= 0 ? "text-[color-mix(in_oklch,var(--status-good)_72%,white)]" : "text-[color-mix(in_oklch,var(--status-critical)_70%,white)]")}>
                        {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${(ret * 100).toFixed(0)}%`}
                      </td>
                      <td className="px-5 py-3.5 text-right"><Outcome status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ByKind({ rows }: { rows: Array<{ kind: string; record: SignalRecord }> }) {
  if (!rows.length) return null;
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
      <h2 className="text-2xl font-semibold sm:text-3xl">By signal type</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Four different things get called a signal, and pooling them into one number would hide which ones actually work. They are scored separately.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.kind} className="card-surface lift p-5">
            <div className="text-sm font-semibold">{r.kind}</div>
            <div className="figure mt-3 text-3xl font-semibold">{r.record.settled > 0 ? pct(r.record.hitRate) : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{r.record.settled > 0 ? `${r.record.won} of ${r.record.settled} graded` : "No calls graded yet"}</div>
            <div className="hatch-rule my-4" />
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Open</dt>
                <dd className="tabular font-medium">{r.record.open}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Baseline</dt>
                <dd className="tabular font-medium">{pct(r.record.settled > 0 ? r.record.baseline : r.record.openBaseline)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Edge</dt>
                <dd className="tabular font-medium">{pts(r.record.edge)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

const RULES: Array<{ head: string; body: string }> = [
  {
    head: "The entry price is written once",
    body: "Whatever the side was trading at the minute we flagged it is the price on the record forever. The code that updates a signal has no access to the entry fields at all, so a call cannot be quietly re-priced to look better.",
  },
  {
    head: "A consensus counts once, not once per scan",
    body: "The scan runs every 15 minutes. A position held for three weeks would otherwise appear as roughly 2,000 separate wins. One outcome is one row for all time, so the denominator is calls made, never how often the job ran.",
  },
  {
    head: "Decided markets are refused entry",
    body: "Polymarket positions sit in a wallet after settlement until the holder redeems them, so a scan reports a finished bet at $1.00 as live conviction. Our first run against real data booked three of those as free wins. Anything already past its close date, or trading above 98¢ or under 2¢, is now rejected — it is a formality, not a call.",
  },
  {
    head: "Cancelled markets are void, not wins",
    body: "When a market pays out nothing on either side it is recorded as void and excluded from the hit rate entirely. It is neither a win to claim nor a loss to bury.",
  },
  {
    head: "Every rate carries its denominator",
    body: `A percentage with no sample size is marketing. Until ${MEANINGFUL_SAMPLE} calls have settled this page says so in plain language, and the hit rate never appears without the market baseline next to it.`,
  },
  {
    head: "Settlement comes from Polymarket, not us",
    body: "Outcomes are read from Polymarket's resolved market data. Nothing on this page is modelled, estimated, or backtested — there is no simulated history here, only calls made forward in time.",
  },
];

function Method() {
  return (
    <section id="method" className="scroll-mt-20 border-t border-border/60 bg-surface-1/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="label-micro">Scoring rules</div>
        <h2 className="mt-3 max-w-2xl text-balance text-2xl font-semibold sm:text-3xl">The ways a track record usually lies, and what stops each one here</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Each of these is enforced in code rather than left to good intentions, because the tempting failure is always the one that flatters the number.</p>
        <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {RULES.map((r, i) => (
            <li key={r.head} className="flex gap-4">
              <span className="figure mt-0.5 shrink-0 text-sm font-semibold text-primary/70">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-base font-semibold">{r.head}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="hatch-rule mt-12" />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-muted-foreground">EDGEWISE is analysis, not advice, and places no wagers. Past results of other traders say nothing certain about future outcomes.</p>
          <LinkButton href="/sign-up" size="lg">
            Follow the smart money
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

export default async function TrackRecordPage() {
  const { record, byKind, open, settled } = await getTrackRecordCached();
  // Soonest real close date among open calls; the ledger is sorted that way already.
  const nextSettlement = open.find((r) => r.endDate !== null)?.endDate ?? null;

  return (
    <div className="pb-4">
      <Hero record={record} nextSettlement={nextSettlement} />
      <StatBand record={record} />
      <ProvisionalNote record={record} />
      <OpenBoard rows={open} />
      <SettledBoard rows={settled} />
      <ByKind rows={byKind} />
      <Method />
      <p className="mx-auto mt-10 w-full max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
        Ledger opened 22 November 2026 · recalculated every 5 minutes ·{" "}
        <Link href="/pricing" className="underline underline-offset-4 hover:text-foreground">
          see what a free account includes
        </Link>
      </p>
    </div>
  );
}
