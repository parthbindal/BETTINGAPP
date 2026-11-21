import Link from "next/link";
import { CalendarDays, Trophy } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listRecentResults, listTeams, listUpcomingGames } from "@/lib/data/sports";
import { Section, EmptyState } from "@/components/shared/page-header";
import { trackUsage } from "@/lib/ops";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string; abbreviation: string; city: string | null; conference: string | null };

function TeamMark({ team, size = "md" }: { team: Pick<Team, "abbreviation">; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-surface-3 font-semibold tracking-wide text-foreground ring-1 ring-inset ring-border", size === "lg" ? "h-10 w-12 text-sm" : "h-7 w-9 text-[11px]")}>
      {team.abbreviation}
    </span>
  );
}

const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const dayName = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default async function SportsPage() {
  const session = await requireUser("/sports");
  const [upcoming, results, teams] = await Promise.all([listUpcomingGames("basketball", 24), listRecentResults("basketball", 9), listTeams("basketball")]);
  trackUsage("sports.index", session.user.id);

  const days: Array<{ key: string; games: typeof upcoming }> = [];
  for (const g of upcoming) {
    const k = dayKey(g.startsAt);
    const last = days.at(-1);
    if (last && last.key === k) last.games.push(g);
    else days.push({ key: k, games: [g] });
  }
  const conferences = ["East", "West"].map((c) => ({ name: c, teams: teams.filter((t) => (t.conference ?? "").toLowerCase().startsWith(c.toLowerCase())) }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">NBA</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">The real NBA schedule and results, updated from balldontlie. Times are US Eastern.</p>
      </div>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <CalendarDays className="size-5 text-primary" aria-hidden="true" /> Coming up
        </h2>
        {days.length ? (
          <div className="mt-3 space-y-5">
            {days.slice(0, 4).map((d) => (
              <div key={d.key}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {dayName(d.key)} <span className="tabular font-normal normal-case tracking-normal">· {d.games.length} game{d.games.length === 1 ? "" : "s"}</span>
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {d.games.map((g) => (
                    <li key={g.id}>
                      <Link href={`/sports/games/${g.id}`} className="card-surface group flex items-center gap-3 p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2.5">
                            <TeamMark team={g.awayTeam} />
                            <span className="truncate text-sm font-medium group-hover:text-primary">{g.awayTeam.name}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <TeamMark team={g.homeTeam} />
                            <span className="truncate text-sm font-medium group-hover:text-primary">{g.homeTeam.name}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">home</span>
                          </div>
                        </div>
                        <span className="tabular shrink-0 text-right text-sm font-semibold">{time(g.startsAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Section className="mt-3">
            <EmptyState title="No games scheduled in the next few days" description="The schedule refreshes with each NBA sync." />
          </Section>
        )}
      </section>

      {results.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Trophy className="size-5 text-status-warning" aria-hidden="true" /> Latest results
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((g) => {
              const awayWon = (g.awayScore ?? 0) > (g.homeScore ?? 0);
              return (
                <li key={g.id} className="card-surface p-4">
                  <div className="mb-2 text-[11px] text-muted-foreground">{dayName(dayKey(g.startsAt))} · Final</div>
                  {[
                    { team: g.awayTeam, score: g.awayScore, won: awayWon },
                    { team: g.homeTeam, score: g.homeScore, won: !awayWon },
                  ].map((r) => (
                    <div key={r.team.id} className="flex items-center gap-2.5 py-1">
                      <TeamMark team={r.team} />
                      <span className={cn("min-w-0 flex-1 truncate text-sm", r.won ? "font-semibold" : "text-muted-foreground")}>{r.team.name}</span>
                      <span className={cn("tabular text-base", r.won ? "font-semibold" : "text-muted-foreground")}>{r.score}</span>
                      {r.won && <span className="text-[10px] font-semibold uppercase text-status-good">W</span>}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Teams</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {conferences.map((c) => (
            <Section key={c.name} title={`${c.name}ern Conference`} description={`${c.teams.length} teams`}>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {c.teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                    <TeamMark team={t} />
                    <span className="truncate">{t.name}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      </section>
    </div>
  );
}
