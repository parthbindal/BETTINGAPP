import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getWhaleWatch } from "@/lib/whales";
import { getWalletLive, walletDailyFlow, WALLET_TRADES_LIMIT, type WalletLive } from "@/lib/wallet-live";
import { Section, EmptyState } from "@/components/shared/page-header";
import { WatchButton } from "@/components/shared/watch-button";
import { RankedBars } from "@/components/charts/ranked-bars";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { CopyButton } from "@/components/intel/copy-button";
import { ActivityChart } from "@/components/intel/activity-chart";
import { compact, dateShort, pct, relative } from "@/lib/format";
import { isWalletAddress, polygonTxUrl, polymarketEventUrl, polymarketProfileUrl, shortAddress } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "down" }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-1 text-xl font-semibold tracking-tight", tone === "down" && "text-chart-2")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${compact(Math.abs(n))}`;

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isWalletAddress(address)) notFound();
  const addr = address.toLowerCase();
  const session = await requireUser(`/wallets/${addr}`);

  let live: WalletLive | null = null;
  let liveError = false;
  const [whale, followed] = await Promise.all([getWhaleWatch(), db.watchlistItem.findFirst({ where: { userId: session.user.id, kind: "wallet", refId: addr }, select: { id: true } })]);
  try {
    live = await getWalletLive(addr);
  } catch {
    liveError = true;
  }
  trackUsage("wallets.view", session.user.id);

  const stat = whale?.payload.wallets?.find((w) => w.wallet.toLowerCase() === addr) ?? null;
  const name = stat?.name ?? shortAddress(addr);
  const positions = [...(live?.positions ?? [])].sort((a, b) => b.currentValue - a.currentValue);
  const trades = live?.trades ?? [];
  const openValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const openCost = positions.reduce((s, p) => s + p.totalCost, 0);
  const unrealized = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const realized = positions.reduce((s, p) => s + p.realizedPnl, 0);
  const openRoi = openCost > 0 ? unrealized / openCost : null;
  const byCategory = new Map<string, number>();
  for (const p of positions) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.currentValue);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([cat, value]) => ({ name: cat, value: Math.round(value) }));
  const limitHit = trades.length >= WALLET_TRADES_LIMIT;
  const flow = walletDailyFlow(trades, limitHit);
  const consensusIn = (whale?.payload.holdings ?? []).filter((h) => h.topHolders?.some((t) => t.wallet.toLowerCase() === addr));

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground">
        <Link href="/wallets" className="hover:text-foreground">Wallet Explorer</Link> / <span className="text-foreground/80">{name}</span>
      </div>

      <section className="card-surface relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgb(22_139_255/0.12),transparent_65%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <TraderAvatar wallet={addr} name={name} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                {stat ? (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground">#{stat.rank} on Polymarket&apos;s profit leaderboard</span>
                ) : (
                  <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Not in the tracked top 1,000</span>
                )}
                {stat?.xUsername && (
                  <a href={`https://x.com/${stat.xUsername}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    @{stat.xUsername}
                  </a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="select-all break-all rounded-md bg-surface-1 px-2 py-1 font-mono text-xs text-foreground/90">{addr}</code>
                <CopyButton value={addr} label="Copy address" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WatchButton kind="wallet" refId={addr} label={name} initial={Boolean(followed)} labels={{ on: "Following", off: "Follow wallet" }} />
            <a href={polymarketProfileUrl(addr)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2">
              View on Polymarket <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {liveError ? (
        <Section>
          <EmptyState title="Polymarket did not respond" description="This wallet's live positions and trades could not be read just now. Try again in a minute." />
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            <Figure label="Leaderboard profit" value={stat ? `$${compact(stat.pnl)}` : "—"} sub={stat ? "Polymarket profit ranking" : "Not ranked in the top 1,000"} />
            <Figure label="Open exposure" value={`$${compact(openValue)}`} sub={`${positions.length} positions of $100+`} />
            <Figure label="Unrealized P&L" value={signed(unrealized)} sub="On open positions" tone={unrealized < 0 ? "down" : undefined} />
            <Figure label="Open ROI" value={openRoi === null ? "—" : `${openRoi >= 0 ? "+" : ""}${pct(openRoi, 1)}`} sub="Unrealized ÷ cost" tone={openRoi !== null && openRoi < 0 ? "down" : undefined} />
            <Figure label="Avg position" value={positions.length ? `$${compact(openValue / positions.length)}` : "—"} sub={`Realized on open: ${signed(realized)}`} />
            <Figure label="Last trade" value={trades[0] ? relative(new Date(trades[0].ts * 1000)) : "—"} sub={`${trades.length} recent trades read`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Section title="Exposure by category" description="Current value of open positions" className="lg:col-span-2">
              {categories.length ? <RankedBars data={categories} valueLabel="Open value" valueFormat="compact" /> : <EmptyState title="No open positions" description="This wallet holds no positions of $100 or more right now." />}
            </Section>
            <Section title="Trading activity" description={limitHit ? `Dollar volume per day (UTC), latest ${WALLET_TRADES_LIMIT} trades` : "Dollar volume per day (UTC), recent trades"} className="lg:col-span-3">
              <ActivityChart data={flow} height={220} emptyText="No recent trades." />
              <p className="mt-2 text-[11px] text-muted-foreground">Polymarket&apos;s public API does not publish a wallet&apos;s profit-and-loss history, so EDGEWISE shows the open book and recent trades rather than a P&amp;L curve.</p>
            </Section>
          </div>

          <Section title="Open positions" description={`${positions.length} positions of $100 or more, largest first`}>
            {positions.length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th scope="col" className="px-1 py-2 font-medium">Market</th>
                      <th scope="col" className="px-1 py-2 font-medium">Position</th>
                      <th scope="col" className="px-1 py-2 text-right font-medium">Entry</th>
                      <th scope="col" className="px-1 py-2 text-right font-medium">Current</th>
                      <th scope="col" className="px-1 py-2 text-right font-medium">Size</th>
                      <th scope="col" className="px-1 py-2 text-right font-medium">Unrealized P&amp;L</th>
                      <th scope="col" className="px-1 py-2 text-right font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const ret = p.totalCost > 0 ? p.unrealizedPnl / p.totalCost : null;
                      return (
                        <tr key={p.tokenId} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                          <td className="max-w-[340px] px-1 py-2.5">
                            {p.eventSlug ? (
                              <a href={polymarketEventUrl(p.eventSlug)} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium hover:text-primary">{p.title}</a>
                            ) : (
                              <span className="line-clamp-2 font-medium">{p.title}</span>
                            )}
                            <div className="text-[11px] text-muted-foreground">{p.category}{p.endDate ? ` · ends ${dateShort(p.endDate)}` : ""}</div>
                          </td>
                          <td className="px-1 py-2.5">
                            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium">{p.outcome || "?"}</span>
                          </td>
                          <td className="tabular px-1 py-2.5 text-right">{Math.round(p.avgPrice * 100)}¢</td>
                          <td className="tabular px-1 py-2.5 text-right">{Math.round(p.currentPrice * 100)}¢</td>
                          <td className="tabular px-1 py-2.5 text-right">
                            ${compact(p.currentValue)}
                            <div className="text-[11px] text-muted-foreground">{compact(p.shares)} shares</div>
                          </td>
                          <td className={cn("tabular px-1 py-2.5 text-right", p.unrealizedPnl < 0 && "text-chart-2")}>
                            {signed(p.unrealizedPnl)}
                            {ret !== null && <div className="text-[11px] text-muted-foreground">{`${ret >= 0 ? "+" : ""}${pct(ret, 1)}`}</div>}
                          </td>
                          <td className="px-1 py-2.5 text-right text-xs text-muted-foreground">{p.firstEntryAt ? dateShort(new Date(p.firstEntryAt)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No open positions" description="This wallet holds no positions of $100 or more right now." />
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-5">
            <Section title="Recent trades" description="Newest first, each linked to its transaction on Polygon" className="lg:col-span-3">
              {trades.length ? (
                <ol className="-mx-1 divide-y divide-border">
                  {trades.slice(0, 25).map((t, i) => (
                    <li key={`${t.txHash ?? t.ts}-${i}`} className="flex items-start justify-between gap-3 px-1 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          <span className={t.side === "BUY" ? "font-medium" : "font-medium text-chart-2"}>{t.side === "BUY" ? "Bought" : "Sold"}</span> {t.outcome} at {Math.round(t.price * 100)}¢
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.eventSlug ? <a href={polymarketEventUrl(t.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-foreground">{t.title}</a> : t.title}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular text-sm font-medium">${compact(t.usd)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {relative(new Date(t.ts * 1000))}
                          {t.txHash && (
                            <>
                              {" · "}
                              <a href={polygonTxUrl(t.txHash)} target="_blank" rel="noreferrer" className="hover:text-foreground">tx</a>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title="No recent trades" description="Polymarket returned no trades for this wallet." />
              )}
            </Section>
            <Section title="Consensus participation" description="Outcomes where this wallet holds alongside other top traders" className="lg:col-span-2" right={<Link href="/consensus" className="text-xs text-primary hover:underline">Consensus →</Link>}>
              {consensusIn.length ? (
                <ul className="-mx-1 divide-y divide-border">
                  {consensusIn.slice(0, 8).map((h) => (
                    <li key={h.tokenId} className="px-1 py-2.5">
                      <div className="line-clamp-2 text-sm font-medium">{h.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Holding <span className="text-foreground/90">{h.outcome}</span> with {h.holders - 1} other tracked wallets · ${compact(h.totalValue)} combined
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No shared positions" description={stat ? "None of this wallet's open positions are among the most-held outcomes in the latest scan." : "This wallet is not in the tracked 1,000, so it is not part of consensus counts."} />
              )}
            </Section>
          </div>
          {live && <p className="text-[11px] text-muted-foreground">Positions and trades read live from Polymarket {relative(live.fetchedAt)} (cached for a few minutes). <Link href={polymarketProfileUrl(addr)} className="inline-flex items-center gap-0.5 hover:text-foreground">Verify on Polymarket <ArrowUpRight className="size-3" aria-hidden="true" /></Link></p>}
        </>
      )}
    </div>
  );
}
