import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, keepScanFresh, type ConsensusHolding, type WhalePayload } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { PageHeader, PageSection, Section, EmptyState } from "@/components/shared/page-header";
import { StatBand } from "@/components/shared/stat-band";
import { Ledger, LedgerBody, LedgerHead, ROW, Td, Th, rowIndex } from "@/components/shared/ledger";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { HoldersOf, PaidNow } from "@/components/intel/consensus-ledger";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateShort, utcStamp } from "@/lib/format";
import { isInPlay, polymarketMarketUrl } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

/*
 * Smart Money Deep Dive (the page was called Whale Watch before the nav was
 * renamed; the heading now matches the nav). What is unique here is the full
 * position book of the tracked traders with unrealized profit on each side, so
 * that is the page. Its old copies of the leaderboard and of the latest buys
 * now live only on Top Traders and Live Trades, and are linked from the foot.
 */

const TITLE = "Smart Money Deep Dive";
const DESCRIPTION = "Every open position Polymarket's most profitable traders hold, grouped by market and side, with how far each is up or down. Read from Polymarket's public on-chain data every hour.";
const CATS = ["All", "Sports", "Politics", "Crypto", "Economics", "Other"];
const SORTS = [
  { key: "profit", label: "Most up" },
  { key: "holders", label: "Most held" },
  { key: "value", label: "Most money" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];
const ROWS = 40;

/** Signed and uncolored: unrealized profit is direction, not a result. Green and red are kept for settled calls. */
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}$${compact(Math.abs(n))}`;

function marketUrl(h: ConsensusHolding) {
  return polymarketMarketUrl(h.slug, h.marketSlug) ?? `https://polymarket.com/markets?_q=${encodeURIComponent(h.title.slice(0, 40))}`;
}

function PositionsLedger({ rows, field }: { rows: ConsensusHolding[]; field: number }) {
  return (
    <Ledger label="Positions held by the top traders">
      <LedgerHead>
        <Th>Market &amp; side</Th>
        <Th right>Up / down so far</Th>
        <Th right className="hidden sm:table-cell">
          Top traders
        </Th>
        <Th right className="hidden md:table-cell">
          Paid → now
        </Th>
        <Th right className="hidden lg:table-cell">
          Money on side
        </Th>
      </LedgerHead>
      <LedgerBody>
        {rows.map((h, i) => (
          <tr key={h.tokenId} style={rowIndex(i)} className={ROW}>
            <Td className="max-w-md">
              <div className="flex items-start gap-1.5">
                <span className="line-clamp-2 text-[13px] leading-snug">{h.title}</span>
                <a href={marketUrl(h)} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary" aria-label="Open on Polymarket">
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                <span className="max-w-[14rem] truncate font-semibold tracking-wide text-secondary-foreground uppercase">{h.outcome}</span>
                <span aria-hidden="true">·</span>
                <span>{h.category}</span>
                {h.endDate && <span className="hidden lg:inline">· closes {dateShort(h.endDate)}</span>}
                <span className="basis-full sm:hidden">
                  {h.holders} of {field.toLocaleString("en-US")} top traders
                </span>
              </div>
            </Td>
            {/* Same weight both ways: dimming the losses would quietly flatter the book. */}
            <Td right figure>
              {signedUsd(h.unrealizedPnl)}
            </Td>
            <Td right className="hidden sm:table-cell">
              <HoldersOf n={h.holders} tracked={field} />
            </Td>
            <Td right className="hidden md:table-cell">
              <PaidNow entry={h.avgEntry} now={h.currentPrice} />
            </Td>
            <Td right className="tabular hidden text-sm lg:table-cell">
              ${compact(h.totalValue)}
            </Td>
          </tr>
        ))}
      </LedgerBody>
    </Ledger>
  );
}

export default async function WhalesPage({ searchParams }: { searchParams: Promise<{ cat?: string; sort?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/whales");
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.scanner) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <UpgradeGate locked feature="The full position book of the top 1,000 traders, with open profit on every side" requiredTier="pro">
          <span />
        </UpgradeGate>
      </div>
    );
  }

  const data = await getWhaleWatch();
  keepScanFresh(data?.ageMs);
  keepAlertsFlowing();
  trackUsage("whales.view", session.user.id);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} actions={<WhaleRefreshButton />} />
        <Section>
          <EmptyState
            title="Reading the top traders' positions"
            description="This page lists every open bet the tracked traders hold, grouped by market and side, with how far each is up or down. It fills in when the first scan of their wallets finishes."
            when="Usually a few minutes · then every hour"
          />
        </Section>
      </div>
    );
  }

  const p: WhalePayload = data.payload;
  const cat = CATS.includes(sp.cat ?? "") ? sp.cat! : "All";
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : "profit";
  const field = p.tradersScanned;

  // Finished bets never reach this page (the scan drops settled and closed markets). What is left out here are sides
  // priced 3c-or-less / 97c-or-more (decided in all but name) and games past their date (see isInPlay); the page says how many.
  const book = p.holdings.filter(isInPlay);
  const doneCount = p.holdings.length - book.length;
  const up = book.filter((h) => h.unrealizedPnl > 0);
  const down = book.filter((h) => h.unrealizedPnl < 0);
  const openProfit = up.reduce((a, h) => a + h.unrealizedPnl, 0);
  const openLoss = down.reduce((a, h) => a + h.unrealizedPnl, 0);
  const biggest = [...book].sort((a, b) => b.unrealizedPnl - a.unrealizedPnl)[0];

  const sortFn = (a: ConsensusHolding, b: ConsensusHolding) => (sort === "value" ? b.totalValue - a.totalValue : sort === "holders" ? b.holders - a.holders || b.totalValue - a.totalValue : b.unrealizedPnl - a.unrealizedPnl);
  const inCat = cat === "All" ? book : book.filter((h) => h.category === cat);
  const holdings = [...inCat].sort(sortFn).slice(0, ROWS);
  const link = (patch: Record<string, string>) => `/whales?${new URLSearchParams({ cat, sort, ...patch }).toString()}`;
  const pairs = p.similarPairs ?? [];

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <PageHeader title={TITLE} description={DESCRIPTION} actions={<WhaleRefreshButton />} />
        <ScanFreshness generatedAt={p.generatedAt} note={`read ${utcStamp(p.generatedAt)} · prices refresh each scan, not tick by tick`} />
      </div>

      <section aria-label="The position book at a glance" className="border-y border-border/60">
        <StatBand
          stats={[
            { label: "Traders tracked", value: field.toLocaleString("en-US"), foot: "Polymarket's most profitable, all-time" },
            { label: "Live market sides", value: book.length.toLocaleString("en-US"), foot: `From ${p.positionsScanned.toLocaleString("en-US")} open bets of $100+${doneCount ? `; ${doneCount} decided or past their game date, left out` : ""}` },
            { label: "Open profit", value: signedUsd(openProfit), foot: `On ${up.length.toLocaleString("en-US")} of ${book.length.toLocaleString("en-US")} sides; ${down.length.toLocaleString("en-US")} are down $${compact(Math.abs(openLoss))}` },
            { label: "Largest open gain", value: biggest ? signedUsd(biggest.unrealizedPnl) : "—", foot: biggest ? `${biggest.outcome} · ${biggest.title.length > 44 ? `${biggest.title.slice(0, 43)}…` : biggest.title}` : "No positions in this scan" },
          ]}
        />
      </section>

      <PageSection
        title="Every position they hold"
        description="Grouped by market and side. Up / down is unrealized profit at today's price: it is not a win or a loss until the market settles, and you are seeing these traders part-way through, often from a much lower entry."
        right={
          <nav className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Sort positions">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={link({ sort: s.key })}
                scroll={false}
                aria-current={sort === s.key ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", sort === s.key && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]")}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {CATS.map((c) => {
            const n = c === "All" ? book.length : book.filter((h) => h.category === c).length;
            return (
              <Link
                key={c}
                href={link({ cat: c })}
                scroll={false}
                aria-current={cat === c ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", cat === c ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
              >
                {c} <span className="tabular text-muted-foreground">{n.toLocaleString("en-US")}</span>
              </Link>
            );
          })}
        </div>
        {holdings.length ? (
          <>
            <PositionsLedger rows={holdings} field={field} />
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {holdings.length} of {inCat.length.toLocaleString("en-US")} {cat === "All" ? "" : `${cat} `}market sides. A large position is a reason to research a market, not a signal to copy it: a profit leaderboard only shows who is winning today, never who blew up.
            </p>
          </>
        ) : (
          <Section>
            <EmptyState title={`No ${cat} positions in this scan`} description="None of the tracked traders held an open bet of $100 or more in this category when the wallets were last read." when="Re-read every hour" />
          </Section>
        )}
      </PageSection>

      {pairs.length > 0 && (
        <PageSection title="Traders making the same picks" description="Pairs of top traders whose recent buys overlap the most, on the exact side of the exact market. A shared pick can be a common read, or just two people active on the same busy slate.">
          <div className="grid gap-4 md:grid-cols-2">
            {pairs.slice(0, 6).map((pr) => (
              <div key={`${pr.a}-${pr.b}`} className="card-surface min-w-0 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                    <span className="max-w-[12rem] truncate">{pr.a}</span>
                    <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="max-w-[12rem] truncate">{pr.b}</span>
                  </div>
                  <span className="tabular shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-inset ring-border">{pr.shared} shared</span>
                </div>
                <div className="tabular mt-1 text-[11px] text-muted-foreground">
                  #{pr.aRank} and #{pr.bRank} all-time · both recently bought
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {pr.markets.slice(0, 5).map((mk, j) => (
                    <li key={j} className="flex min-w-0 items-baseline gap-2">
                      <span className="max-w-[9rem] shrink-0 truncate font-semibold tracking-wide text-secondary-foreground uppercase">{mk.outcome}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{mk.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Source: Polymarket&apos;s public Data API (on-chain positions), read {utcStamp(p.generatedAt)}. The latest buys by these traders are on{" "}
        <Link href="/activity" className="text-foreground underline underline-offset-4 hover:text-primary">
          Live Trades
        </Link>
        , and the full ranking on{" "}
        <Link href="/leaderboard" className="text-foreground underline underline-offset-4 hover:text-primary">
          Top Traders
        </Link>
        . EDGEWISE shows confirmed on-chain positions to help you research; it is not advice to copy them and it places no bets. 18+.
      </p>
    </div>
  );
}
