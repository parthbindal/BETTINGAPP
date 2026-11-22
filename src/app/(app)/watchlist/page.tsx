import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import { requireUser, getEntitlements } from "@/lib/session";
import { listWatchlist } from "@/lib/watchlist";
import { refreshProvenance } from "@/lib/data/types";
import {
  PageHeader,
  Section,
  EmptyState,
} from "@/components/shared/page-header";
import { DataBadge } from "@/components/shared/data-badge";
import { ActionButton } from "@/components/shared/action-button";
import { AddTopicForm } from "@/components/watchlist/add-topic-form";
import { LinkButton } from "@/components/ui/link-button";
import { TraderIdentity } from "@/components/intel/trader-identity";
import { getWhaleWatch } from "@/lib/whales";
import { pct, relative, compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

function Remove({ id }: { id: string }) {
  return (
    <ActionButton
      href="/api/watchlist"
      method="DELETE"
      body={{ id }}
      variant="ghost"
      size="xs"
      successMessage="Removed from watchlist"
    >
      <Trash2 className="size-3.5" />
      <span className="sr-only">Remove</span>
    </ActionButton>
  );
}

export default async function WatchlistPage() {
  const session = await requireUser("/watchlist");
  const [ent, items, whale] = await Promise.all([
    getEntitlements(session.user.id),
    listWatchlist(session.user.id),
    getWhaleWatch(),
  ]);
  trackUsage("watchlist.view", session.user.id);
  const followedWallets = items.filter((i) => i.kind === "wallet");
  const walletStats = new Map(
    (whale?.payload.wallets ?? []).map((w) => [w.wallet.toLowerCase(), w]),
  );
  const markets = items.filter((i) => i.kind === "market");
  const players = items.filter((i) => i.kind === "player");
  const teams = items.filter((i) => i.kind === "team" || i.kind === "event");
  const topics = items.filter((i) => i.kind === "topic" || i.kind === "stat");
  const max = ent.limits.watchlistMax;
  const statusColor: Record<string, string> = {
    healthy: "text-status-good",
    questionable: "text-status-warning",
    doubtful: "text-status-serious",
    out: "text-status-critical",
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Watchlist"
        description="The traders, markets and topics you follow, with what changed since you last looked."
        actions={
          <span className="tabular text-xs text-muted-foreground">
            {items.length} / {max} items
          </span>
        }
      />
      {items.length >= max && (
        <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          Your watchlist is full on the {ent.tier} plan.{" "}
          <Link href="/pricing" className="underline">
            Upgrade
          </Link>{" "}
          for more capacity, or remove an item.
        </p>
      )}

      <Section
        title="Traders you follow"
        description="From the latest Polymarket scan"
        right={
          <Link
            href="/leaderboard"
            className="text-xs text-primary hover:underline"
          >
            Find traders →
          </Link>
        }
      >
        {followedWallets.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">
                    Wallet
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Profit
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Open exposure
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Positions
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Last active
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {followedWallets.map((w) => {
                  const s = walletStats.get(w.refId.toLowerCase());
                  return (
                    <tr
                      key={w.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2.5">
                        <TraderIdentity
                          wallet={w.refId}
                          name={s?.name ?? w.label}
                          rank={s?.rank}
                          size={26}
                        />
                      </td>
                      <td className="tabular py-2.5 text-right">
                        {s ? `$${compact(s.pnl)}` : "—"}
                      </td>
                      <td className="tabular py-2.5 text-right">
                        {s ? `$${compact(s.openValue)}` : "—"}
                      </td>
                      <td className="tabular py-2.5 text-right">
                        {s ? s.positions : "—"}
                      </td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground">
                        {s?.lastActive
                          ? relative(s.lastActive)
                          : s
                            ? "No open positions"
                            : "Not in the tracked 1,000"}
                      </td>
                      <td className="py-2.5 text-right">
                        <Remove id={w.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Star />}
            title="No wallets followed"
            description="Open any trader from Top Traders or Wallet Lookup and tap Follow."
            action={
              <LinkButton href="/leaderboard" size="sm" variant="outline">
                Browse the leaderboard
              </LinkButton>
            }
          />
        )}
      </Section>

      <Section
        title="Prediction markets"
        description="Implied probability now vs. when it was last recorded for you"
        right={
          <Link
            href="/settings/notifications"
            className="text-xs text-primary hover:underline"
          >
            Alert settings →
          </Link>
        }
      >
        {markets.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">Market</th>
                  <th className="py-1.5 font-medium">Implied</th>
                  <th className="py-1.5 font-medium">Change</th>
                  <th className="hidden py-1.5 font-medium sm:table-cell">
                    24h vol
                  </th>
                  <th className="hidden py-1.5 font-medium md:table-cell">
                    Closes
                  </th>
                  <th className="hidden py-1.5 font-medium md:table-cell">
                    Data
                  </th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {markets.map((w) => (
                  <tr key={w.id} className="border-t border-border/50">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/markets/${w.refId}`}
                        className="font-medium hover:text-primary"
                      >
                        {w.label}
                      </Link>
                    </td>
                    <td className="tabular py-2 font-semibold">
                      {pct(w.currentValue, 0)}
                    </td>
                    <td
                      className={cn(
                        "tabular py-2 text-xs",
                        w.change === null || Math.abs(w.change) < 0.005
                          ? "text-muted-foreground"
                          : w.change > 0
                            ? "text-status-good"
                            : "text-status-critical",
                      )}
                    >
                      {w.change === null
                        ? "—"
                        : `${w.change > 0 ? "+" : ""}${(w.change * 100).toFixed(0)} pts`}
                    </td>
                    <td className="tabular hidden py-2 text-muted-foreground sm:table-cell">
                      {w.market ? compact(w.market.volume24h) : "—"}
                    </td>
                    <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                      {w.market ? relative(w.market.closeTime) : "—"}
                    </td>
                    <td className="hidden py-2 md:table-cell">
                      {w.market ? (
                        <DataBadge
                          provenance={refreshProvenance(w.market.provenance)}
                          compact
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Remove id={w.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Star />}
            title="No markets followed"
            description="Open any market and click Watch to track its probability."
            action={
              <LinkButton href="/markets" size="sm" variant="outline">
                Browse markets
              </LinkButton>
            }
          />
        )}
      </Section>

      {(players.length > 0 || teams.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Players">
            {players.length ? (
              <ul className="divide-y divide-border/60">
                {players.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <Link
                      href={`/sports/players/${w.refId}`}
                      className="min-w-0 truncate font-medium hover:text-primary"
                    >
                      {w.label}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {w.player ? (
                        <>
                          {w.player.team.abbreviation} · {w.player.position}
                          <span
                            className={cn(
                              "capitalize",
                              statusColor[w.player.injuryStatus ?? ""] ?? "",
                            )}
                          >
                            ● {w.player.injuryStatus ?? "unknown"}
                          </span>
                        </>
                      ) : (
                        "Unavailable"
                      )}
                      <Remove id={w.id} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Follow a player from their profile page to be told about
                upcoming games.
              </p>
            )}
          </Section>
          <Section title="Teams and games">
            {teams.length ? (
              <ul className="divide-y divide-border/60">
                {teams.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <Link
                      href={
                        w.kind === "event"
                          ? `/sports/games/${w.refId}`
                          : "/sports"
                      }
                      className="min-w-0 truncate font-medium hover:text-primary"
                    >
                      {w.label}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-xs capitalize text-muted-foreground">
                      {w.kind === "event" ? "Game" : "Team"}{" "}
                      <Remove id={w.id} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Follow a team or a game from the NBA page.
              </p>
            )}
          </Section>
        </div>
      )}

      <Section
        title="Research topics and statistical categories"
        description="Saved searches you want to keep coming back to"
      >
        <AddTopicForm />
        {topics.length > 0 && (
          <ul className="mt-4 divide-y divide-border/60">
            {topics.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{w.label}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    · {w.kind === "stat" ? "Statistical category" : "Topic"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <Link
                    href={`/markets?q=${encodeURIComponent(w.label)}`}
                    className="text-primary hover:underline"
                  >
                    Find markets
                  </Link>
                  <Link
                    href="/analyst"
                    className="text-primary hover:underline"
                  >
                    Ask analyst
                  </Link>
                  <Remove id={w.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
