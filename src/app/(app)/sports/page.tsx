import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getSportsOverview } from "@/lib/data/sports";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { DemoBanner } from "@/components/sports/demo-banner";
import { DemoTag } from "@/components/shared/badges";
import { dateTime } from "@/lib/format";
import { trackUsage } from "@/lib/ops";

const FUTURE = ["Tennis", "College basketball", "College football", "MLB", "Golf"];

export default async function SportsPage() {
  const session = await requireUser("/sports");
  const o = await getSportsOverview();
  trackUsage("sports.index", session.user.id);
  return (
    <div className="space-y-5">
      <PageHeader title="Sports Analytics" description="Player profiles, projection analysis and matchup intelligence with explicit sample sizes, variance and uncertainty. Built to plug in licensed data providers per sport." />
      <DemoBanner configured={o.liveProviderConfigured} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {o.sports.map((s) => (
          <Link key={s.key} href={`/sports/${s.key}`} className="card-surface group p-4 transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold group-hover:text-primary">{s.label}</div>{s.isDemo && <DemoTag />}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.key === "basketball" && !s.isDemo ? "NBA · live" : s.league}</div>
            <div className="mt-3 flex gap-4 text-xs"><span><span className="tabular font-semibold">{s.teams}</span> teams</span><span><span className="tabular font-semibold">{s.players}</span> players</span></div>
            <div className="mt-2 flex flex-wrap gap-1">{s.stats.slice(0, 4).map((st) => <span key={st.key} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">{st.label}</span>)}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Upcoming games" description="Next scheduled events with projection lines" className="lg:col-span-2">
          {o.upcoming.length ? (
            <ul className="divide-y divide-border/60">
              {o.upcoming.map((g) => (
                <li key={g.id}><Link href={`/sports/games/${g.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2/40"><span><span className="text-xs uppercase text-muted-foreground">{g.sport}</span> · {g.awayTeam.name} at {g.homeTeam.name}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{dateTime(g.startsAt)}{g.isDemo && <DemoTag />}</span></Link></li>
              ))}
            </ul>
          ) : <EmptyState title="No scheduled games" description="Run the seed to load demo data or connect a provider." />}
        </Section>
        <Section title="Coming next" description="Sports the engine is designed to support">
          <ul className="space-y-1.5 text-sm text-muted-foreground">{FUTURE.map((f) => <li key={f} className="flex items-center justify-between"><span>{f}</span><span className="text-[11px]">Awaiting licensed provider</span></li>)}</ul>
          <p className="mt-3 text-[11px] text-muted-foreground">Each sport is a provider adapter plus a stat-profile definition; no UI changes are required to add one.</p>
        </Section>
      </div>
    </div>
  );
}
