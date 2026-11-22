import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getEntitlements } from "@/lib/session";
import { analyzePlayerProjection, getPlayerProfile, statLabel } from "@/lib/data/sports";
import { PageHeader, Section } from "@/components/shared/page-header";
import { DataBadge } from "@/components/shared/data-badge";
import { ConfidenceBadge, UpgradeGate } from "@/components/shared/badges";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { ConfidenceInterval } from "@/components/charts/confidence-interval";
import { Sparkline } from "@/components/charts/sparkline";
import { WatchButton } from "@/components/shared/watch-button";
import { PredictionDialog } from "@/components/shared/prediction-dialog";
import { ReportButton } from "@/components/shared/report-button";
import { db } from "@/lib/db";
import { pct, num, dateShort, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trackUsage } from "@/lib/ops";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stat?: string; line?: string; window?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireUser(`/sports/players/${id}`);
  const ent = await getEntitlements(session.user.id);
  const profile = await getPlayerProfile(id, ent.limits.sportsDepth === "basic" ? 20 : 80);
  if (!profile) notFound();
  const { player, logs, statKeys, seasonAverages, last5Averages, upcoming, projections } = profile;
  const stat = sp.stat && statKeys.includes(sp.stat) ? sp.stat : projections[0]?.stat ?? statKeys[0]!;
  const defaultLine = projections.find((p) => p.stat === stat)?.line ?? (Number.isFinite(seasonAverages[stat]) ? Math.round(seasonAverages[stat]! * 2) / 2 + 0.5 : 10.5);
  const line = Number(sp.line ?? defaultLine) || defaultLine;
  const window = Math.min(Number(sp.window ?? 60) || 60, ent.limits.sportsDepth === "basic" ? 20 : 80);
  const result = await analyzePlayerProjection(id, stat, line, { window });
  const watched = await db.watchlistItem.findUnique({ where: { userId_kind_refId: { userId: session.user.id, kind: "player", refId: id } } });
  trackUsage("sports.player", session.user.id, { playerId: id, stat });
  const a = result?.analysis;
  const chrono = [...logs].reverse();
  const series = chrono.map((l) => l.stats[stat] ?? 0);
  const gameLabels = chrono.map((l) => `${dateShort(l.date)} ${l.isHome ? "vs" : "@"} ${l.opponent.abbreviation}`);
  const statusColor: Record<string, string> = { healthy: "text-status-good", questionable: "text-status-warning", doubtful: "text-status-serious", out: "text-status-critical" };
  const linkFor = (patch: Record<string, string>) => `/sports/players/${id}?${new URLSearchParams({ stat, line: String(line), window: String(window), ...patch }).toString()}`;

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground"><Link href="/sports" className="hover:text-foreground">Sports</Link> / <Link href={`/sports/${player.sport}`} className="hover:text-foreground capitalize">{player.sport}</Link> / {player.name}</div>
      <PageHeader
        title={<span className="flex items-center gap-2">{player.name}</span>}
        description={<span className="flex flex-wrap items-center gap-2"><span>{player.team.name} · {player.position}{player.jersey ? ` · #${player.jersey}` : ""}</span><span className={cn("capitalize", statusColor[player.injuryStatus ?? ""] ?? "")}>● {player.injuryStatus ?? "unknown"}</span>{player.injuryNote && <span className="text-xs">({player.injuryNote})</span>}<DataBadge provenance={profile.provenance} /></span>}
        actions={
          <>
            <WatchButton kind="player" refId={player.id} label={player.name} initial={Boolean(watched)} />
            {a && <PredictionDialog target={{ domain: "sports", playerId: player.id, stat, line }} question={`${player.name}: ${statLabel(player.sport, stat)} over/under ${line}${upcoming ? ` (${dateShort(upcoming.startsAt)})` : ""}`} sides={[{ value: "over", label: "Over" }, { value: "under", label: "Under" }]} referenceProb={a.estimate.probOver} referenceLabel="Model estimate" disabledReason={upcoming ? null : "No upcoming game is scheduled for this player"} />}
            <ReportButton subjectKind="player" subjectRef={player.id} stat={stat} line={line} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Averages" description={`${logs.length} games logged · season vs last 5`} className="lg:col-span-1">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1 font-medium">Stat</th><th className="tabular py-1 text-right font-medium">Season</th><th className="tabular py-1 text-right font-medium">Last 5</th><th className="py-1 pl-3 font-medium">Trend</th></tr></thead>
            <tbody>
              <tr className="border-t border-border/50"><td className="py-1.5 text-muted-foreground">Minutes</td><td className="tabular py-1.5 text-right">{num(seasonAverages.minutes)}</td><td className="tabular py-1.5 text-right">{num(last5Averages.minutes)}</td><td className="py-1.5 pl-3"><Sparkline data={chrono.map((l) => l.minutes)} height={20} interactive valueLabel="Minutes" valueFormat="decimal" pointLabels={gameLabels} /></td></tr>
              {statKeys.map((k) => (
                <tr key={k} className={cn("border-t border-border/50", k === stat && "bg-primary/5")}>
                  <td className="py-1.5"><Link href={linkFor({ stat: k, line: String(projections.find((p) => p.stat === k)?.line ?? Math.round((seasonAverages[k] ?? 0) * 2) / 2 + 0.5) })} className={cn("hover:text-primary", k === stat && "font-medium text-primary")}>{statLabel(player.sport, k)}</Link></td>
                  <td className="tabular py-1.5 text-right">{num(seasonAverages[k])}</td>
                  <td className="tabular py-1.5 text-right">{num(last5Averages[k])}</td>
                  <td className="py-1.5 pl-3"><Sparkline data={chrono.map((l) => l.stats[k] ?? 0)} height={20} interactive valueLabel={statLabel(player.sport, k)} valueFormat="decimal" pointLabels={gameLabels} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {upcoming && <p className="mt-3 text-xs text-muted-foreground">Next: <Link href={`/sports/games/${upcoming.id}`} className="text-primary hover:underline">{upcoming.awayTeam.abbreviation} at {upcoming.homeTeam.abbreviation}</Link> · {dateTime(upcoming.startsAt)}</p>}
        </Section>

        <Section
          title={`Projection analysis · ${statLabel(player.sport, stat)} ${line}`}
          description={`Model ${a?.modelVersion ?? "proj-v0.1"} · last ${a?.sampleSize ?? 0} games`}
          className="lg:col-span-2"
          right={a && <ConfidenceBadge level={a.estimate.confidence} />}
        >
          <form className="mb-4 flex flex-wrap items-end gap-2" action={`/sports/players/${id}`}>
            <input type="hidden" name="stat" value={stat} />
            <label className="text-xs text-muted-foreground">Line<input name="line" type="number" step="0.5" defaultValue={line} className="ml-2 h-8 w-24 rounded-lg border border-input bg-surface-2/40 px-2 text-sm tabular" /></label>
            <label className="text-xs text-muted-foreground">Window
              <select name="window" defaultValue={window} className="ml-2 h-8 rounded-lg border border-input bg-surface-2/40 px-2 text-sm">
                {[10, 20, 40, 80].filter((w) => w <= (ent.limits.sportsDepth === "basic" ? 20 : 80)).map((w) => <option key={w} value={w}>Last {w}</option>)}
              </select>
            </label>
            <button className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">Analyze</button>
            {projections.length > 0 && <span className="ml-auto text-[11px] text-muted-foreground">Available lines: {projections.map((p) => `${statLabel(player.sport, p.stat)} ${p.line}`).join(" · ")}</span>}
          </form>
          {a ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <DistributionChart bins={a.distribution} line={line} />
                <p className="mt-1 text-[11px] text-muted-foreground">Distribution of {statLabel(player.sport, stat)} over {a.sampleSize} games; darker bars are above the line.</p>
                <ConfidenceInterval
                  className="mt-5"
                  title={`How often over ${line}`}
                  subtitle="Share of games above the line, with the range the true rate plausibly sits in."
                  rows={[
                    { label: "Last 5", hits: a.windows.last5.overHits, n: a.windows.last5.n },
                    { label: "Last 10", hits: a.windows.last10.overHits, n: a.windows.last10.n },
                    { label: `Last ${a.windows.season.n}`, hits: a.windows.season.overHits, n: a.windows.season.n },
                  ].filter((r, i, all) => all.findIndex((x) => x.n === r.n) === i)}
                  reference={{ value: a.estimate.probOver, label: "Model" }}
                />
                <table className="mt-4 w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Window</th><th className="tabular py-1 text-right font-medium">n</th><th className="tabular py-1 text-right font-medium">Mean</th><th className="tabular py-1 text-right font-medium">Median</th><th className="tabular py-1 text-right font-medium">σ</th><th className="tabular py-1 text-right font-medium">Over</th></tr></thead>
                  <tbody>
                    {(["season", "last10", "last5"] as const).map((k) => (
                      <tr key={k} className="border-t border-border/40"><td className="py-1 capitalize">{k === "season" ? `Last ${a.windows.season.n}` : k.replace("last", "Last ")}</td><td className="tabular py-1 text-right">{a.windows[k].n}</td><td className="tabular py-1 text-right">{num(a.windows[k].mean)}</td><td className="tabular py-1 text-right">{num(a.windows[k].median)}</td><td className="tabular py-1 text-right">{num(a.windows[k].stdev)}</td><td className="tabular py-1 text-right">{pct(a.windows[k].overRate, 0)} ({a.windows[k].overHits}/{a.windows[k].n})</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-surface-2/50 p-3">
                  <div className="text-[11px] text-muted-foreground">Blended estimate</div>
                  <div className="mt-1 flex items-baseline gap-3"><span className="tabular text-2xl font-semibold">P(over) {pct(a.estimate.probOver, 0)}</span><span className="tabular text-xs text-muted-foreground">95% range {pct(a.estimate.interval.low, 0)}–{pct(a.estimate.interval.high, 0)} (n={a.sampleSize})</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>Parametric (normal): {pct(a.estimate.parametricProbOver, 0)}</span><span>Empirical (shrunk): {pct(a.estimate.empiricalProbOver, 0)}</span><span>Weighted mean: {num(a.estimate.weightedMean)}</span><span>σ: {num(a.estimate.sd)}</span></div>
                </div>
                <UpgradeGate locked={!ent.limits.matchupIntelligence} feature="Splits and matchup context" requiredTier="pro" compact>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/60 p-2"><dt className="text-muted-foreground">Home</dt><dd className="tabular">{num(a.splits.home.mean)} avg · {pct(a.splits.home.overRate, 0)} over (n={a.splits.home.n})</dd></div>
                    <div className="rounded-lg border border-border/60 p-2"><dt className="text-muted-foreground">Away</dt><dd className="tabular">{num(a.splits.away.mean)} avg · {pct(a.splits.away.overRate, 0)} over (n={a.splits.away.n})</dd></div>
                    {a.splits.vsStrongDefense && <div className="rounded-lg border border-border/60 p-2"><dt className="text-muted-foreground">vs stronger defenses</dt><dd className="tabular">{num(a.splits.vsStrongDefense.mean)} avg · {pct(a.splits.vsStrongDefense.overRate, 0)} over (n={a.splits.vsStrongDefense.n})</dd></div>}
                    {a.splits.vsWeakDefense && <div className="rounded-lg border border-border/60 p-2"><dt className="text-muted-foreground">vs weaker defenses</dt><dd className="tabular">{num(a.splits.vsWeakDefense.mean)} avg · {pct(a.splits.vsWeakDefense.overRate, 0)} over (n={a.splits.vsWeakDefense.n})</dd></div>}
                    <div className="rounded-lg border border-border/60 p-2 col-span-2"><dt className="text-muted-foreground">Minutes</dt><dd className="tabular">{num(a.minutes.last5Mean)} last 5 vs {num(a.minutes.seasonMean)} season ({a.minutes.changePct >= 0 ? "+" : ""}{(a.minutes.changePct * 100).toFixed(0)}%)</dd></div>
                    {result?.nextOpponent && <div className="rounded-lg border border-border/60 p-2 col-span-2"><dt className="text-muted-foreground">Next opponent</dt><dd>{result.nextOpponent.name} · def {result.nextOpponent.defRating?.toFixed(1)} · pace {result.nextOpponent.pace?.toFixed(1)}</dd></div>}
                  </dl>
                </UpgradeGate>
                <div>
                  <div className="mb-1 text-xs font-medium">Flags</div>
                  <ul className="space-y-1 text-xs">
                    {a.flags.length ? a.flags.map((f) => <li key={f.text} className={cn("flex gap-1.5", f.level === "warning" ? "text-status-warning" : "text-muted-foreground")}><span>●</span>{f.text}</li>) : <li className="text-muted-foreground">No flags.</li>}
                  </ul>
                </div>
                <ul className="space-y-1 text-[11px] italic text-muted-foreground">{a.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No game logs for this stat.</p>
          )}
        </Section>
      </div>

      <Section title="Game log" description={`Most recent ${Math.min(logs.length, 20)} games`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Date</th><th className="py-1 font-medium">Opp</th><th className="py-1 font-medium">H/A</th><th className="tabular py-1 text-right font-medium">Min</th>{statKeys.map((k) => <th key={k} className={cn("tabular py-1 text-right font-medium", k === stat && "text-primary")}>{statLabel(player.sport, k)}</th>)}</tr></thead>
            <tbody>
              {logs.slice(0, 20).map((l) => (
                <tr key={l.id} className="border-t border-border/40"><td className="tabular py-1">{dateShort(l.date)}</td><td className="py-1">{l.opponent.abbreviation}</td><td className="py-1 text-muted-foreground">{l.isHome ? "H" : "A"}</td><td className="tabular py-1 text-right">{l.minutes}</td>{statKeys.map((k) => <td key={k} className={cn("tabular py-1 text-right", k === stat && (l.stats[k] ?? 0) > line && "text-chart-1 font-medium")}>{l.stats[k] ?? "—"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>Values above the current line are highlighted.</span>{series.length > 20 && <span>{series.length} games in analysis window</span>}</div>
      </Section>
    </div>
  );
}
