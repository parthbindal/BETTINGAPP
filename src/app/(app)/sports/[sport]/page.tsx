import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listPlayers, listTeams, listUpcomingGames, SPORTS, type Sport } from "@/lib/data/sports";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DemoBanner } from "@/components/sports/demo-banner";
import { config } from "@/lib/env";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function SportPage({ params, searchParams }: { params: Promise<{ sport: string }>; searchParams: Promise<{ q?: string; team?: string }> }) {
  const { sport } = await params;
  const sp = await searchParams;
  const def = SPORTS.find((s) => s.key === sport);
  if (!def) notFound();
  await requireUser(`/sports/${sport}`);
  const [teams, players, games] = await Promise.all([listTeams(sport as Sport), listPlayers(sport as Sport, { q: sp.q, teamId: sp.team, limit: 120 }), listUpcomingGames(sport as Sport, 10)]);
  // Per-sport demo state: a provider key can make one sport real (NBA) while others stay demo.
  const sportIsDemo = teams.length ? teams.every((t) => t.isDemo) : !config.isSportsLiveConfigured;
  const statusColor: Record<string, string> = { healthy: "text-status-good", questionable: "text-status-warning", doubtful: "text-status-serious", out: "text-status-critical" };
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/sports" className="hover:text-foreground">Sports</Link> / {def.label}</div>
      <PageHeader title={def.label} description={sportIsDemo ? def.league : sport === "basketball" ? "NBA · live via balldontlie" : def.league} />
      <DemoBanner configured={!sportIsDemo} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Teams" description="Pace and defensive rating drive matchup context">
          <ul className="space-y-1">
            {teams.map((t) => (
              <li key={t.id}><Link href={`/sports/${sport}?team=${t.id}`} className={cn("flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-surface-2/40", sp.team === t.id && "bg-surface-2/60")}><span>{t.name} <span className="text-xs text-muted-foreground">{t.abbreviation}</span></span><span className="tabular text-xs text-muted-foreground">{t.pace != null ? `pace ${t.pace.toFixed(1)}${t.defRating != null ? ` · def ${t.defRating.toFixed(1)}` : ""}` : (t.division ?? "")}</span></Link></li>
            ))}
          </ul>
        </Section>
        <Section title="Players" description={`${players.length} shown`} className="lg:col-span-2" right={
          <form className="flex gap-2" action={`/sports/${sport}`}>
            {sp.team && <input type="hidden" name="team" value={sp.team} />}
            <input name="q" defaultValue={sp.q} placeholder="Search players" className="h-8 rounded-lg border border-input bg-surface-2/40 px-2.5 text-xs" />
            <button className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">Search</button>
          </form>
        }>
          {players.length === 0 && !sportIsDemo && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">Live rosters aren&apos;t included on this data tier.</strong> The teams and schedule shown here are real. Player rosters and prop projections require the balldontlie ALL-STAR tier — add it and re-run the sync to populate them.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1.5 font-medium">Player</th><th className="py-1.5 font-medium">Team</th><th className="py-1.5 font-medium">Pos</th><th className="py-1.5 font-medium">Status</th></tr></thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-border/50 hover:bg-surface-2/30"><td className="py-2"><Link href={`/sports/players/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link></td><td className="py-2 text-muted-foreground">{p.team.abbreviation}</td><td className="py-2 text-muted-foreground">{p.position}</td><td className={cn("py-2 text-xs capitalize", statusColor[p.injuryStatus ?? ""] ?? "text-muted-foreground")}>{p.injuryStatus ?? "unknown"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
      <Section title="Upcoming games">
        <ul className="grid gap-2 sm:grid-cols-2">
          {games.map((g) => (
            <li key={g.id}><Link href={`/sports/games/${g.id}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/40"><span>{g.awayTeam.name} at {g.homeTeam.name}</span><span className="text-xs text-muted-foreground">{dateTime(g.startsAt)} · {g._count.projections} lines</span></Link></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
