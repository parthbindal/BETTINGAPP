import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getEntitlements } from "@/lib/session";
import { getMatchupIntel, statLabel } from "@/lib/data/sports";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DataBadge } from "@/components/shared/data-badge";
import { DemoTag, UpgradeGate } from "@/components/shared/badges";
import { dateTime, num } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/sports/games/${id}`);
  const ent = await getEntitlements(session.user.id);
  const intel = await getMatchupIntel(id);
  if (!intel) notFound();
  const { game, leagueDef, leaguePace, rosters } = intel;
  const notes: string[] = [];
  for (const r of rosters) {
    if (r.team.pace !== null && r.team.pace !== undefined) notes.push(`${r.team.name} plays at pace ${r.team.pace.toFixed(1)} vs league ${leaguePace.toFixed(1)} (${r.team.pace > leaguePace ? "more" : "fewer"} possessions → ${r.team.pace > leaguePace ? "more" : "fewer"} opportunities for both sides).`);
    if (r.team.defRating !== null && r.team.defRating !== undefined) notes.push(`${r.team.name} defensive rating ${r.team.defRating.toFixed(1)} vs league ${leagueDef.toFixed(1)} (${r.team.defRating < leagueDef ? "stronger" : "weaker"} than average; lower is better).`);
    const outs = r.players.filter((p) => p.injuryStatus && p.injuryStatus !== "healthy");
    if (outs.length) notes.push(`${r.team.name} injury report: ${outs.map((p) => `${p.name} (${p.injuryStatus})`).join(", ")}. Absences shift minutes and usage to teammates.`);
    const trending = r.players.filter((p) => Math.abs(p.minutesDelta) >= 0.12 && p.games >= 5);
    for (const p of trending.slice(0, 2)) notes.push(`${p.name}'s minutes are ${p.minutesDelta > 0 ? "up" : "down"} ${(Math.abs(p.minutesDelta) * 100).toFixed(0)}% over the last five games (${p.last5Min.toFixed(1)} vs ${p.seasonMin.toFixed(1)}).`);
  }
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/sports" className="hover:text-foreground">Sports</Link> / <Link href={`/sports/${game.sport}`} className="hover:text-foreground capitalize">{game.sport}</Link> / Matchup</div>
      <PageHeader title={<span className="flex items-center gap-2">{game.awayTeam.name} at {game.homeTeam.name} {game.isDemo && <DemoTag />}</span>} description={<span className="flex flex-wrap items-center gap-2"><span>{dateTime(game.startsAt)} · {game.venue} · {game.status}</span><DataBadge provenance={intel.provenance} /></span>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Matchup intelligence" description="Plain-English report built from team and roster context" className="lg:col-span-2">
          <UpgradeGate locked={!ent.limits.matchupIntelligence} feature="Matchup intelligence report" requiredTier="pro">
            <ul className="space-y-2 text-sm">{notes.map((n) => <li key={n} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{n}</li>)}</ul>
            <p className="mt-3 text-[11px] text-muted-foreground">Pace and defensive quality are context, not predictions. Check each player&apos;s projection analysis for sample size and variance.</p>
          </UpgradeGate>
        </Section>
        <Section title="Team context" description="vs league average">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Team</th><th className="tabular py-1 text-right font-medium">Pace</th><th className="tabular py-1 text-right font-medium">Def</th><th className="tabular py-1 text-right font-medium">Off</th></tr></thead>
            <tbody>
              {rosters.map((r) => <tr key={r.team.id} className="border-t border-border/40"><td className="py-1.5">{r.team.name}</td><td className="tabular py-1.5 text-right">{num(r.team.pace)}</td><td className={cn("tabular py-1.5 text-right", (r.team.defRating ?? 0) < leagueDef ? "text-status-good" : "text-status-warning")}>{num(r.team.defRating)}</td><td className="tabular py-1.5 text-right">{num(r.team.offRating)}</td></tr>)}
              <tr className="border-t border-border/40 text-muted-foreground"><td className="py-1.5">League</td><td className="tabular py-1.5 text-right">{num(leaguePace)}</td><td className="tabular py-1.5 text-right">{num(leagueDef)}</td><td className="py-1.5" /></tr>
            </tbody>
          </table>
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rosters.map((r) => (
          <Section key={r.team.id} title={r.team.name} description="Minutes trend and availability">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Player</th><th className="py-1 font-medium">Pos</th><th className="tabular py-1 text-right font-medium">Min (season)</th><th className="tabular py-1 text-right font-medium">Last 5</th><th className="py-1 font-medium">Status</th></tr></thead>
              <tbody>
                {r.players.map((p) => <tr key={p.id} className="border-t border-border/40"><td className="py-1.5"><Link href={`/sports/players/${p.id}`} className="hover:text-primary">{p.name}</Link></td><td className="py-1.5 text-muted-foreground">{p.position}</td><td className="tabular py-1.5 text-right">{p.seasonMin.toFixed(1)}</td><td className={cn("tabular py-1.5 text-right", Math.abs(p.minutesDelta) >= 0.12 && (p.minutesDelta > 0 ? "text-status-good" : "text-status-warning"))}>{p.last5Min.toFixed(1)}</td><td className={cn("py-1.5 capitalize", p.injuryStatus === "healthy" ? "text-muted-foreground" : "text-status-warning")}>{p.injuryStatus}</td></tr>)}
              </tbody>
            </table>
          </Section>
        ))}
      </div>
      <Section title="Projection lines for this game" description={`${game.projections.length} lines · click to analyze`}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {game.projections.map((p) => <li key={p.id}><Link href={`/sports/players/${p.playerId}?stat=${p.stat}&line=${p.line}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/40"><span>{p.player.name} <span className="text-xs text-muted-foreground">{statLabel(game.sport, p.stat)}</span></span><span className="tabular font-semibold">{p.line}</span></Link></li>)}
        </ul>
      </Section>
    </div>
  );
}
