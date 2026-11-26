import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { getWhaleWatch, keepScanFresh, type SharedPosition, type WalletStat, type WhalePayload } from "@/lib/whales";
import { keepAlertsFlowing } from "@/lib/smart-alerts";
import { PageHeader, PageSection, Section, EmptyState } from "@/components/shared/page-header";
import { StatBand } from "@/components/shared/stat-band";
import { Ledger, LedgerBody, LedgerHead, ROW, Td, Th, rowIndex } from "@/components/shared/ledger";
import { UpgradeGate } from "@/components/shared/badges";
import { ScanFreshness } from "@/components/intel/scan-freshness";
import { HoldersOf, PaidNow } from "@/components/intel/consensus-ledger";
import { WhaleRefreshButton } from "@/components/whales/refresh-button";
import { compact, dateShort, utcStamp } from "@/lib/format";
import { isInPlay, polymarketMarketUrl, walletHref } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

/*
 * Smart Money Deep Dive: EVERY open bet that two or more of the 1,000 tracked
 * traders share (same market, same side), with who shares it. The Signals page
 * shows only the ones with 10+ traders; until 2026-11-25 this page showed the
 * 120 most-held sides the scan kept, which missed ~1,000 live shared bets
 * (every one held by 2-4 traders and most held by 5-9). The scan now stores
 * them all (WhalePayload.shared).
 */

const TITLE = "Smart Money Deep Dive";
const DESCRIPTION = "Every open bet that two or more of Polymarket's 1,000 most profitable traders share: the same side of the same market, with who holds it and how it is going. Read from Polymarket's public on-chain data every hour.";
const CATS = ["All", "Sports", "Politics", "Crypto", "Economics", "Other"];
const SORTS = [
  { key: "holders", label: "Most traders" },
  { key: "profit", label: "Most up" },
  { key: "value", label: "Most money" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];
const MINS = [2, 3, 5, 10] as const;
const PAGE_SIZE = 50;

type Row = Pick<SharedPosition, "tokenId" | "title" | "outcome" | "category" | "holders" | "totalValue" | "avgEntry" | "currentPrice" | "unrealizedPnl" | "endDate" | "ranks"> & { slug?: string | null; marketSlug?: string | null };

/** Signed and uncolored: unrealized profit is direction, not a result. Green and red are kept for settled calls. */
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}$${compact(Math.abs(n))}`;

/** Who shares this bet: the first few holders by position size, by name, each linking to their wallet. */
function Holders({ ranks, byRank }: { ranks: number[]; byRank: Map<number, WalletStat> }) {
  const named = ranks.map((r) => byRank.get(r)).filter((w): w is WalletStat => Boolean(w));
  const shown = named.slice(0, 3);
  const more = ranks.length - shown.length;
  if (!shown.length) return null;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      Held by{" "}
      {shown.map((w, i) => (
        <span key={w.wallet}>
          {i > 0 && ", "}
          <Link href={walletHref(w.wallet)} className="text-secondary-foreground hover:text-primary hover:underline">
            {w.name.length > 18 ? `${w.name.slice(0, 17)}…` : w.name}
          </Link>
          <span className="tabular"> #{w.rank}</span>
        </span>
      ))}
      {more > 0 && <span> and {more} more</span>}
    </div>
  );
}

function SharedLedger({ rows, field, byRank }: { rows: Row[]; field: number; byRank: Map<number, WalletStat> }) {
  return (
    <Ledger label="Open bets shared by the top traders">
      <LedgerHead>
        <Th>Market, side &amp; who</Th>
        <Th right>Top traders</Th>
        <Th right className="hidden sm:table-cell">
          Up / down so far
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
                {polymarketMarketUrl(h.slug, h.marketSlug) ? (
                  <a href={polymarketMarketUrl(h.slug, h.marketSlug)!} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary" aria-label="Open on Polymarket">
                    <ArrowUpRight className="size-3.5" />
                  </a>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                <span className="max-w-[14rem] truncate font-semibold tracking-wide text-secondary-foreground uppercase">{h.outcome}</span>
                <span aria-hidden="true">·</span>
                <span>{h.category}</span>
                {h.endDate && !h.endDate.startsWith("1970") && <span className="hidden lg:inline">· closes {dateShort(h.endDate)}</span>}
                <span className="sm:hidden">· {signedUsd(h.unrealizedPnl)} so far</span>
              </div>
              <Holders ranks={h.ranks} byRank={byRank} />
            </Td>
            <Td right>
              <HoldersOf n={h.holders} tracked={field} />
            </Td>
            {/* Same weight both ways: dimming the losses would quietly flatter the book. */}
            <Td right figure className="hidden sm:table-cell">
              {signedUsd(h.unrealizedPnl)}
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

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", active ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")}>
      {children}
    </Link>
  );
}

export default async function WhalesPage({ searchParams }: { searchParams: Promise<{ cat?: string; sort?: string; min?: string; page?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/whales");
  const ent = await getEntitlements(session.user.id);
  if (!ent.limits.scanner) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <UpgradeGate locked feature="Every open bet the top 1,000 traders share, with who holds each one" requiredTier="pro">
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
            description="This page lists every open bet two or more of the tracked traders share, with who holds it and how far it is up or down. It fills in when the first scan of their wallets finishes."
            when="Usually a few minutes · then every hour"
          />
        </Section>
      </div>
    );
  }

  const p: WhalePayload = data.payload;
  const field = p.tradersScanned;
  const cat = CATS.includes(sp.cat ?? "") ? sp.cat! : "All";
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : "holders";
  const min = MINS.find((m) => String(m) === sp.min) ?? 2;
  const byRank = new Map((p.wallets ?? []).map((w) => [w.rank, w]));

  // Every shared bet from scans since 2026-11-25; older snapshots only kept the 120 most-held, with their top holders.
  const all: Row[] = p.shared ?? p.holdings.map((h) => ({ ...h, ranks: (h.topHolders ?? []).map((t) => t.rank) }));
  // Finished bets never reach this page (the scan drops settled and closed markets). Left out here: sides priced
  // 3c-or-less / 97c-or-more (decided in all but name) and games past their date (see isInPlay). The page says how many.
  const book = all.filter(isInPlay);
  const doneCount = all.length - book.length;
  const bySize = (lo: number, hi = Infinity) => book.filter((h) => h.holders >= lo && h.holders <= hi).length;
  const up = book.filter((h) => h.unrealizedPnl > 0);
  const down = book.filter((h) => h.unrealizedPnl < 0);
  const openProfit = up.reduce((a, h) => a + h.unrealizedPnl, 0);
  const openLoss = down.reduce((a, h) => a + h.unrealizedPnl, 0);

  const sortFn = (a: Row, b: Row) => (sort === "value" ? b.totalValue - a.totalValue : sort === "profit" ? b.unrealizedPnl - a.unrealizedPnl : b.holders - a.holders || b.totalValue - a.totalValue);
  const filtered = book.filter((h) => h.holders >= min && (cat === "All" || h.category === cat)).sort(sortFn);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const link = (patch: Record<string, string>) => `/whales?${new URLSearchParams({ cat, sort, min: String(min), page: "1", ...patch }).toString()}`;

  const holderPairs = p.holderPairs ?? [];
  const recentPairs = p.similarPairs ?? [];

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <PageHeader title={TITLE} description={DESCRIPTION} actions={<WhaleRefreshButton />} />
        <ScanFreshness generatedAt={p.generatedAt} note={`read ${utcStamp(p.generatedAt)} · prices refresh each scan, not tick by tick`} />
      </div>

      <section aria-label="Shared bets at a glance" className="border-y border-border/60">
        <StatBand
          stats={[
            { label: "Shared open bets", value: book.length.toLocaleString("en-US"), foot: `Held by 2+ of the ${field.toLocaleString("en-US")} traders${doneCount ? `; ${doneCount} decided or past their game date, left out` : ""}` },
            { label: "Held by 10+", value: bySize(10).toLocaleString("en-US"), foot: `Signals. Then ${bySize(5, 9)} held by 5–9, ${bySize(3, 4)} by 3–4, ${bySize(2, 2)} by 2` },
            { label: "Open profit", value: signedUsd(openProfit), foot: `On ${up.length.toLocaleString("en-US")} of ${book.length.toLocaleString("en-US")} shared bets; ${down.length.toLocaleString("en-US")} are down $${compact(Math.abs(openLoss))}` },
            { label: "Positions read", value: p.positionsScanned.toLocaleString("en-US"), foot: "Every open bet of $100+ across all tracked traders" },
          ]}
        />
      </section>

      <PageSection
        title="Every bet they share"
        description="Each row is one side of one market that two or more of the tracked traders hold, with who they are. Up / down is unrealized profit at today's price: not a win or a loss until the market settles."
        right={
          <nav className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Sort shared bets">
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
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Minimum traders">
          <span className="mr-1 w-24 shrink-0 text-xs text-muted-foreground">Shared by</span>
          {MINS.map((m) => (
            <Chip key={m} href={link({ min: String(m) })} active={min === m}>
              {m}+ traders <span className="tabular text-muted-foreground">{bySize(m).toLocaleString("en-US")}</span>
            </Chip>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Category">
          <span className="mr-1 w-24 shrink-0 text-xs text-muted-foreground">Topic</span>
          {CATS.map((c) => (
            <Chip key={c} href={link({ cat: c })} active={cat === c}>
              {c} <span className="tabular text-muted-foreground">{book.filter((h) => h.holders >= min && (c === "All" || h.category === c)).length.toLocaleString("en-US")}</span>
            </Chip>
          ))}
        </div>
        {rows.length ? (
          <>
            <SharedLedger rows={rows} field={field} byRank={byRank} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular">
                Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-US")}–{((page - 1) * PAGE_SIZE + rows.length).toLocaleString("en-US")} of {filtered.length.toLocaleString("en-US")} shared bets
                {cat === "All" ? "" : ` in ${cat}`}, held by {min}+ traders
              </span>
              {pages > 1 && (
                <nav className="flex items-center gap-1" aria-label="Pages">
                  {page > 1 ? (
                    <Link href={link({ page: String(page - 1) })} scroll={false} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-foreground/90 hover:bg-surface-2">
                      <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 opacity-40">
                      <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
                    </span>
                  )}
                  <span className="tabular px-2">
                    Page {page} of {pages}
                  </span>
                  {page < pages ? (
                    <Link href={link({ page: String(page + 1) })} scroll={false} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-foreground/90 hover:bg-surface-2">
                      Next <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 opacity-40">
                      Next <ChevronRight className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                </nav>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">A shared bet is a reason to research a market, not a signal to copy it: a profit leaderboard only shows who is winning today, never who blew up.</p>
          </>
        ) : (
          <Section>
            <EmptyState title="No shared bets match" description={`None of the live bets in this scan is held by ${min} or more of the tracked traders${cat === "All" ? "" : ` in ${cat}`}. Try fewer traders or another topic.`} when="Re-read every hour" />
          </Section>
        )}
      </PageSection>

      {holderPairs.length > 0 ? (
        <PageSection title="Traders with the most bets in common" description={`Pairs of the ${field.toLocaleString("en-US")} tracked traders who hold the most of the same live bets right now: same market, same side. A shared bet can be a common read, or two people on the same busy slate.`}>
          <div className="grid gap-4 md:grid-cols-2">
            {holderPairs.slice(0, 10).map((pr) => {
              const a = byRank.get(pr.aRank);
              const b = byRank.get(pr.bRank);
              return (
                <div key={`${pr.aRank}-${pr.bRank}`} className="card-surface min-w-0 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                      {a ? (
                        <Link href={walletHref(a.wallet)} className="max-w-[12rem] truncate hover:text-primary">
                          {a.name}
                        </Link>
                      ) : (
                        <span>#{pr.aRank}</span>
                      )}
                      <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {b ? (
                        <Link href={walletHref(b.wallet)} className="max-w-[12rem] truncate hover:text-primary">
                          {b.name}
                        </Link>
                      ) : (
                        <span>#{pr.bRank}</span>
                      )}
                    </div>
                    <span className="tabular shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-inset ring-border">{pr.shared} shared</span>
                  </div>
                  <div className="tabular mt-1 text-[11px] text-muted-foreground">
                    #{pr.aRank} and #{pr.bRank} all-time · both hold now
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
              );
            })}
          </div>
        </PageSection>
      ) : (
        recentPairs.length > 0 && (
          <PageSection title="Traders making the same picks" description="Pairs of top traders whose recent buys overlap the most, on the exact side of the exact market.">
            <div className="grid gap-4 md:grid-cols-2">
              {recentPairs.slice(0, 6).map((pr) => (
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
        )
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Source: Polymarket&apos;s public Data API (on-chain positions), read {utcStamp(p.generatedAt)}. A trader counts on the side they lean (60%+ of their money in that market); evenly hedged traders are left out. The latest buys by these traders are on{" "}
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
