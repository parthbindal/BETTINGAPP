/**
 * Deterministic DEMO sports data generator.
 *
 * All teams, players, games, statistics and projection lines here are
 * fictional. They exist so the analytics engine can be exercised end-to-end
 * before a licensed sports data provider is connected. Every record is stored
 * with isDemo=true and the UI labels it as sample data.
 */

export type Sport = "basketball" | "football" | "soccer" | "hockey";

export const SPORTS: Array<{ key: Sport; label: string; league: string; stats: Array<{ key: string; label: string }> }> = [
  {
    key: "basketball",
    label: "Basketball",
    league: "Demo Basketball League (NBA-style)",
    stats: [
      { key: "pts", label: "Points" },
      { key: "reb", label: "Rebounds" },
      { key: "ast", label: "Assists" },
      { key: "threes", label: "Three-pointers" },
      { key: "pra", label: "Pts + Reb + Ast" },
      { key: "stl", label: "Steals" },
      { key: "blk", label: "Blocks" },
    ],
  },
  {
    key: "football",
    label: "Football",
    league: "Demo Football League (NFL-style)",
    stats: [
      { key: "passYds", label: "Passing yards" },
      { key: "passTd", label: "Passing TDs" },
      { key: "rushYds", label: "Rushing yards" },
      { key: "recYds", label: "Receiving yards" },
      { key: "rec", label: "Receptions" },
    ],
  },
  {
    key: "soccer",
    label: "Soccer",
    league: "Demo Soccer League",
    stats: [
      { key: "goals", label: "Goals" },
      { key: "sot", label: "Shots on target" },
      { key: "shots", label: "Shots" },
      { key: "ast", label: "Assists" },
    ],
  },
  {
    key: "hockey",
    label: "Hockey",
    league: "Demo Hockey League (NHL-style)",
    stats: [
      { key: "goals", label: "Goals" },
      { key: "ast", label: "Assists" },
      { key: "shots", label: "Shots on goal" },
      { key: "pts", label: "Points" },
    ],
  },
];

// ---- seeded PRNG ----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rng: () => number, mu: number, sigma: number) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(rng: () => number, lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}
const round1 = (x: number) => Math.round(x * 10) / 10;

const CITIES = ["Harbor City", "Summit", "Ridgeport", "Lakeshore", "Ironvale", "Crescent Bay", "Northgate", "Saltmarsh", "Pinecrest", "Redmesa", "Fairhaven", "Stonebridge"];
const NICKS = ["Tides", "Peaks", "Foundry", "Herons", "Anvils", "Breakers", "Sentinels", "Marsh Hawks", "Timberwolves", "Coyotes", "Mariners", "Masons"];
const FIRST = ["Jalen", "Marcus", "Theo", "Elias", "Darius", "Kai", "Mateo", "Noah", "Idris", "Luca", "Rafael", "Owen", "Zion", "Caleb", "Amir", "Felix", "Jonah", "Ezra", "Silas", "Dante", "Rowan", "Miles", "Aiden", "Tobias"];
const LAST = ["Okafor", "Lindqvist", "Marchetti", "Okoro", "Haddad", "Petrov", "Nakamura", "Castellano", "Brandt", "Oyelaran", "Fitzgerald", "Varga", "Delacroix", "Mbeki", "Sorensen", "Quintero", "Abernathy", "Kowalski", "Ferreira", "Nilsen", "Takahashi", "Whitlock", "Ibarra", "Dufresne"];

export interface DemoTeam {
  id: string;
  sport: Sport;
  name: string;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  pace: number;
  defRating: number; // lower is better defense (points allowed per 100 poss for basketball; scaled for others)
  offRating: number;
}
export interface DemoPlayer {
  id: string;
  sport: Sport;
  teamId: string;
  name: string;
  position: string;
  jersey: string;
  injuryStatus: string;
  injuryNote: string | null;
  profile: Record<string, { mu: number; sd: number }>;
  minutesMu: number;
  minutesSd: number;
}
export interface DemoGame {
  id: string;
  sport: Sport;
  homeTeamId: string;
  awayTeamId: string;
  startsAt: Date;
  status: "scheduled" | "final";
  homeScore: number | null;
  awayScore: number | null;
  venue: string;
}
export interface DemoLog {
  playerId: string;
  gameId: string;
  date: Date;
  isHome: boolean;
  opponentId: string;
  minutes: number;
  stats: Record<string, number>;
}
export interface DemoProjection {
  playerId: string;
  gameId: string;
  stat: string;
  line: number;
}

interface SportSpec {
  teams: number;
  playersPerTeam: number;
  pastGamesPerTeam: number;
  upcomingDays: number;
  positions: Array<{ pos: string; count: number; profile: (rng: () => number, tier: number) => Record<string, { mu: number; sd: number }>; minutes: [number, number] }>;
  score: (rng: () => number) => number;
  paceRange: [number, number];
  defRange: [number, number];
  projectableStats: string[];
}

const SPECS: Record<Sport, SportSpec> = {
  basketball: {
    teams: 10,
    playersPerTeam: 8,
    pastGamesPerTeam: 28,
    upcomingDays: 7,
    paceRange: [96, 104],
    defRange: [108, 118],
    projectableStats: ["pts", "reb", "ast", "threes", "pra"],
    score: (rng) => Math.round(normal(rng, 112, 11)),
    positions: [
      { pos: "G", count: 3, minutes: [30, 4], profile: (rng, tier) => ({ pts: { mu: 14 + tier * 6 + rng() * 3, sd: 5.5 }, reb: { mu: 3.5 + rng(), sd: 1.8 }, ast: { mu: 4.5 + tier * 2 + rng(), sd: 2.2 }, threes: { mu: 1.8 + tier * 0.8, sd: 1.3 }, stl: { mu: 1.1, sd: 0.9 }, blk: { mu: 0.3, sd: 0.5 } }) },
      { pos: "F", count: 3, minutes: [29, 4], profile: (rng, tier) => ({ pts: { mu: 12 + tier * 6 + rng() * 3, sd: 5.5 }, reb: { mu: 6 + tier * 1.5 + rng(), sd: 2.4 }, ast: { mu: 2.5 + tier, sd: 1.6 }, threes: { mu: 1.2 + tier * 0.6, sd: 1.1 }, stl: { mu: 0.9, sd: 0.8 }, blk: { mu: 0.7, sd: 0.7 } }) },
      { pos: "C", count: 2, minutes: [27, 4], profile: (rng, tier) => ({ pts: { mu: 11 + tier * 5 + rng() * 3, sd: 5 }, reb: { mu: 8.5 + tier * 2 + rng(), sd: 2.8 }, ast: { mu: 1.5 + tier * 0.7, sd: 1.2 }, threes: { mu: 0.3, sd: 0.5 }, stl: { mu: 0.6, sd: 0.7 }, blk: { mu: 1.4 + tier * 0.4, sd: 1 } }) },
    ],
  },
  football: {
    teams: 8,
    playersPerTeam: 5,
    pastGamesPerTeam: 10,
    upcomingDays: 7,
    paceRange: [60, 70],
    defRange: [18, 28],
    projectableStats: ["passYds", "rushYds", "recYds", "rec"],
    score: (rng) => Math.round(normal(rng, 23, 8)),
    positions: [
      { pos: "QB", count: 1, minutes: [60, 2], profile: (rng, tier) => ({ passYds: { mu: 225 + tier * 40 + rng() * 20, sd: 62 }, passTd: { mu: 1.5 + tier * 0.5, sd: 1.1 }, rushYds: { mu: 12 + rng() * 10, sd: 14 } }) },
      { pos: "RB", count: 1, minutes: [45, 8], profile: (rng, tier) => ({ rushYds: { mu: 55 + tier * 25 + rng() * 10, sd: 28 }, rec: { mu: 2.5 + tier, sd: 1.6 }, recYds: { mu: 18 + tier * 8, sd: 15 } }) },
      { pos: "WR", count: 3, minutes: [50, 8], profile: (rng, tier) => ({ rec: { mu: 3.5 + tier * 1.5 + rng(), sd: 2 }, recYds: { mu: 45 + tier * 22 + rng() * 10, sd: 30 }, targets: { mu: 5.5 + tier * 2, sd: 2.3 } }) },
    ],
  },
  soccer: {
    teams: 8,
    playersPerTeam: 6,
    pastGamesPerTeam: 14,
    upcomingDays: 7,
    paceRange: [10, 16],
    defRange: [0.9, 1.8],
    projectableStats: ["sot", "shots", "goals"],
    score: (rng) => poisson(rng, 1.4),
    positions: [
      { pos: "FW", count: 2, minutes: [82, 12], profile: (rng, tier) => ({ goals: { mu: 0.35 + tier * 0.2, sd: 0.6 }, shots: { mu: 2.4 + tier * 1 + rng() * 0.5, sd: 1.4 }, sot: { mu: 0.9 + tier * 0.5, sd: 0.9 }, ast: { mu: 0.15 + tier * 0.1, sd: 0.4 } }) },
      { pos: "MF", count: 3, minutes: [80, 14], profile: (rng, tier) => ({ goals: { mu: 0.12 + tier * 0.08, sd: 0.35 }, shots: { mu: 1.3 + tier * 0.6 + rng() * 0.4, sd: 1.1 }, sot: { mu: 0.45 + tier * 0.25, sd: 0.65 }, ast: { mu: 0.2 + tier * 0.1, sd: 0.45 } }) },
      { pos: "DF", count: 1, minutes: [88, 6], profile: (rng, tier) => ({ goals: { mu: 0.05 + tier * 0.03, sd: 0.22 }, shots: { mu: 0.6 + tier * 0.2, sd: 0.8 }, sot: { mu: 0.2, sd: 0.45 }, ast: { mu: 0.08, sd: 0.28 } }) },
    ],
  },
  hockey: {
    teams: 8,
    playersPerTeam: 6,
    pastGamesPerTeam: 18,
    upcomingDays: 7,
    paceRange: [28, 34],
    defRange: [2.5, 3.5],
    projectableStats: ["shots", "pts", "goals"],
    score: (rng) => poisson(rng, 3),
    positions: [
      { pos: "C", count: 2, minutes: [18, 2.5], profile: (rng, tier) => ({ goals: { mu: 0.35 + tier * 0.15, sd: 0.6 }, ast: { mu: 0.45 + tier * 0.2, sd: 0.7 }, shots: { mu: 2.6 + tier * 0.9 + rng() * 0.4, sd: 1.5 } }) },
      { pos: "W", count: 2, minutes: [16, 2.5], profile: (rng, tier) => ({ goals: { mu: 0.3 + tier * 0.15, sd: 0.55 }, ast: { mu: 0.35 + tier * 0.15, sd: 0.6 }, shots: { mu: 2.4 + tier * 0.8, sd: 1.4 } }) },
      { pos: "D", count: 2, minutes: [21, 3], profile: (rng, tier) => ({ goals: { mu: 0.1 + tier * 0.05, sd: 0.32 }, ast: { mu: 0.3 + tier * 0.15, sd: 0.55 }, shots: { mu: 1.7 + tier * 0.5, sd: 1.2 } }) },
    ],
  },
};

export interface DemoDataset {
  teams: DemoTeam[];
  players: DemoPlayer[];
  games: DemoGame[];
  logs: DemoLog[];
  projections: DemoProjection[];
}

export function generateDemoData(now = new Date(), seed = 20261114): DemoDataset {
  const rng = mulberry32(seed);
  const out: DemoDataset = { teams: [], players: [], games: [], logs: [], projections: [] };
  let cityIdx = 0;

  for (const sport of Object.keys(SPECS) as Sport[]) {
    const spec = SPECS[sport];
    const teams: DemoTeam[] = [];
    for (let i = 0; i < spec.teams; i++) {
      const city = CITIES[(cityIdx + i) % CITIES.length]!;
      const nick = NICKS[(cityIdx + i * 5) % NICKS.length]!;
      const [pLo, pHi] = spec.paceRange;
      const [dLo, dHi] = spec.defRange;
      teams.push({
        id: `demo-${sport}-t${i + 1}`,
        sport,
        name: `${city} ${nick}`,
        abbreviation: (city.replace(/[^A-Z]/g, "") + nick[0]).slice(0, 3).toUpperCase() + (i + 1),
        city,
        conference: i % 2 ? "East" : "West",
        division: ["North", "South", "Central"][i % 3]!,
        pace: round1(pLo + rng() * (pHi - pLo)),
        defRating: round1(dLo + rng() * (dHi - dLo)),
        offRating: round1(dLo + rng() * (dHi - dLo)),
      });
    }
    cityIdx += 3;
    out.teams.push(...teams);

    // players
    for (const team of teams) {
      let n = 0;
      for (const posSpec of spec.positions) {
        for (let k = 0; k < posSpec.count; k++) {
          const tier = k === 0 ? 1 : k === 1 ? 0.5 : 0; // first at each position is the star
          const inj = rng();
          const injuryStatus = inj < 0.06 ? "out" : inj < 0.12 ? "questionable" : inj < 0.15 ? "doubtful" : "healthy";
          out.players.push({
            id: `demo-${sport}-p${team.id.split("-t")[1]}-${++n}`,
            sport,
            teamId: team.id,
            name: `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`,
            position: posSpec.pos,
            jersey: String(Math.floor(rng() * 45) + 1),
            injuryStatus,
            injuryNote: injuryStatus === "healthy" ? null : injuryStatus === "out" ? "Lower-body injury; not expected to play (demo)" : "Listed on the injury report (demo)",
            profile: posSpec.profile(rng, tier),
            minutesMu: posSpec.minutes[0] + tier * 4,
            minutesSd: posSpec.minutes[1],
          });
        }
      }
    }

    // schedule: past games (round robin-ish) and upcoming
    const dayMs = 86400_000;
    const teamGameCount = new Map<string, number>();
    let gameNo = 0;
    const gamesPerDay = Math.max(1, Math.floor(spec.teams / 2) - 1);
    const pastDays = Math.ceil((spec.pastGamesPerTeam * spec.teams) / 2 / gamesPerDay) + 4;
    for (let d = pastDays; d >= 1; d--) {
      const date = new Date(now.getTime() - d * dayMs);
      date.setHours(19, 0, 0, 0);
      const order = [...teams].sort(() => rng() - 0.5);
      for (let g = 0; g < gamesPerDay && 2 * g + 1 < order.length; g++) {
        const home = order[2 * g]!;
        const away = order[2 * g + 1]!;
        if ((teamGameCount.get(home.id) ?? 0) >= spec.pastGamesPerTeam || (teamGameCount.get(away.id) ?? 0) >= spec.pastGamesPerTeam) continue;
        teamGameCount.set(home.id, (teamGameCount.get(home.id) ?? 0) + 1);
        teamGameCount.set(away.id, (teamGameCount.get(away.id) ?? 0) + 1);
        const game: DemoGame = {
          id: `demo-${sport}-g${++gameNo}`,
          sport,
          homeTeamId: home.id,
          awayTeamId: away.id,
          startsAt: date,
          status: "final",
          homeScore: spec.score(rng) + 1,
          awayScore: spec.score(rng),
          venue: `${home.city} Arena`,
        };
        out.games.push(game);
        for (const team of [home, away]) {
          const opp = team === home ? away : home;
          const isHome = team === home;
          const paceFactor = spec.paceRange[1] > 20 ? (team.pace + opp.pace) / (spec.paceRange[0] + spec.paceRange[1]) : 1;
          const defFactor = 1 + ((opp.defRating - (spec.defRange[0] + spec.defRange[1]) / 2) / ((spec.defRange[1] - spec.defRange[0]) / 2)) * 0.08;
          const homeFactor = isHome ? 1.03 : 0.97;
          for (const p of out.players.filter((x) => x.teamId === team.id)) {
            if (p.injuryStatus === "out" && rng() < 0.7) continue;
            const minutes = Math.max(0, round1(normal(rng, p.minutesMu, p.minutesSd)));
            const minFactor = minutes / p.minutesMu;
            const stats: Record<string, number> = {};
            for (const [key, dist] of Object.entries(p.profile)) {
              const mu = dist.mu * paceFactor * defFactor * homeFactor * minFactor;
              const v = dist.mu < 2 ? poisson(rng, Math.max(0.01, mu)) : Math.max(0, Math.round(normal(rng, mu, dist.sd)));
              stats[key] = v;
            }
            if (sport === "basketball") stats.pra = (stats.pts ?? 0) + (stats.reb ?? 0) + (stats.ast ?? 0);
            if (sport === "hockey") stats.pts = (stats.goals ?? 0) + (stats.ast ?? 0);
            out.logs.push({ playerId: p.id, gameId: game.id, date, isHome, opponentId: opp.id, minutes, stats });
          }
        }
      }
    }
    for (let d = 0; d < spec.upcomingDays; d++) {
      const date = new Date(now.getTime() + d * dayMs);
      date.setHours(19, 30, 0, 0);
      const order = [...teams].sort(() => rng() - 0.5);
      for (let g = 0; g < gamesPerDay && 2 * g + 1 < order.length; g++) {
        const home = order[2 * g]!;
        const away = order[2 * g + 1]!;
        const game: DemoGame = {
          id: `demo-${sport}-g${++gameNo}`,
          sport,
          homeTeamId: home.id,
          awayTeamId: away.id,
          startsAt: date,
          status: "scheduled",
          homeScore: null,
          awayScore: null,
          venue: `${home.city} Arena`,
        };
        out.games.push(game);
        // projections for the two most-used players per team at each projectable stat
        for (const team of [home, away]) {
          const roster = out.players.filter((x) => x.teamId === team.id && x.injuryStatus !== "out").sort((a, b) => b.minutesMu - a.minutesMu).slice(0, 4);
          for (const p of roster) {
            for (const stat of spec.projectableStats) {
              const logs = out.logs.filter((l) => l.playerId === p.id);
              const vals = logs.map((l) => l.stats[stat]).filter((v): v is number => typeof v === "number");
              if (vals.length < 5) continue;
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              if (avg < 0.4) continue;
              const line = avg >= 8 ? Math.round(avg + normal(rng, 0, 1.2)) + 0.5 : Math.round((avg + normal(rng, 0, 0.3)) * 2) / 2 || 0.5;
              out.projections.push({ playerId: p.id, gameId: game.id, stat, line: Math.max(0.5, line) });
            }
          }
        }
      }
    }
  }
  return out;
}
