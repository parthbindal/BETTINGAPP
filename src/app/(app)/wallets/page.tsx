import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getWhaleWatch, type WalletStat } from "@/lib/whales";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { TraderIdentity } from "@/components/intel/trader-identity";
import { compact, relative } from "@/lib/format";
import { isWalletAddress } from "@/lib/intel";
import { trackUsage } from "@/lib/ops";

function WalletList({ title, description, wallets, metric }: { title: string; description: string; wallets: WalletStat[]; metric: (w: WalletStat) => string }) {
  return (
    <Section title={title} description={description}>
      {wallets.length ? (
        <ul className="-mx-1 divide-y divide-border">
          {wallets.map((w) => (
            <li key={w.wallet} className="flex items-center justify-between gap-3 px-1 py-2">
              <TraderIdentity wallet={w.wallet} name={w.name} rank={w.rank} size={26} />
              <span className="tabular shrink-0 text-sm font-medium">{metric(w)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No wallets yet" description="Appears after the first scan." />
      )}
    </Section>
  );
}

export default async function WalletExplorerIndex({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireUser("/wallets");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  if (query && isWalletAddress(query)) redirect(`/wallets/${query.toLowerCase()}`);

  const whale = await getWhaleWatch();
  trackUsage("wallets.index", session.user.id);
  const wallets = whale?.payload.wallets ?? [];
  const needle = query.toLowerCase();
  const nameMatches = query ? wallets.filter((w) => w.name.toLowerCase().includes(needle)).sort((a, b) => a.rank - b.rank) : [];
  if (nameMatches.length === 1) redirect(`/wallets/${nameMatches[0]!.wallet.toLowerCase()}`);

  const byRank = [...wallets].sort((a, b) => a.rank - b.rank).slice(0, 8);
  const recent = wallets.filter((w) => w.lastActive).sort((a, b) => Date.parse(b.lastActive!) - Date.parse(a.lastActive!)).slice(0, 8);
  const biggest = [...wallets].sort((a, b) => b.openValue - a.openValue).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Smart money" title="Wallet Explorer" description="Open any Polymarket wallet to see its live positions, its recent trades and where it overlaps with the other top traders." />

      <Section>
        <form action="/wallets" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="wallet-search" className="sr-only">
            Wallet address or trader name
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="wallet-search"
              name="q"
              defaultValue={query}
              placeholder="Paste a 0x wallet address or type a trader name"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-input bg-surface-1 pl-9 pr-3 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <button type="submit" className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Open wallet
          </button>
        </form>
        {query && !nameMatches.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            “{query}” is not a wallet address (0x followed by 40 hex characters) and matches no tracked trader. Any Polymarket wallet can be opened by its address, tracked or not.
          </p>
        )}
        {nameMatches.length > 1 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-muted-foreground">{nameMatches.length} tracked traders match “{query}”</div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nameMatches.slice(0, 12).map((w) => (
                <li key={w.wallet} className="rounded-lg border border-border px-3 py-2">
                  <TraderIdentity wallet={w.wallet} name={w.name} rank={w.rank} size={26} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <WalletList title="Top by profit" description="Polymarket's profit leaderboard" wallets={byRank} metric={(w) => `$${compact(w.pnl)}`} />
        <WalletList title="Recently active" description="Latest activity on an open position" wallets={recent} metric={(w) => (w.lastActive ? relative(w.lastActive) : "—")} />
        <WalletList title="Largest open books" description="Current value of open positions" wallets={biggest} metric={(w) => `$${compact(w.openValue)}`} />
      </div>
    </div>
  );
}
