/**
 * balldontlie NBA API adapter (https://docs.balldontlie.io).
 *
 * Auth: the raw API key in the `Authorization` header (no "Bearer" prefix).
 * Tiers (per league): Free = teams/players/games only, 5 req/min. ALL-STAR adds
 * /stats (box scores), 60 req/min. GOAT adds everything, 600 req/min. We throttle
 * to `config.balldontlieRpm` (default 5, safe for Free) and back off on 429.
 *
 * This module only talks to the API and shapes the JSON. Mapping into our DB and
 * projection generation live in `src/lib/data/sports-sync.ts`.
 */
import { config } from "@/lib/env";

const BASE = "https://api.balldontlie.io/v1";

/** Thrown when the key is missing/invalid or the account tier lacks the endpoint (HTTP 401). */
export class BalldontlieAuthError extends Error {
  constructor(public endpoint: string) {
    super(`balldontlie returned 401 for ${endpoint}: the key is missing/invalid or your account tier does not include this endpoint.`);
    this.name = "BalldontlieAuthError";
  }
}
export class BalldontlieNotConfiguredError extends Error {
  constructor() {
    super("BALLDONTLIE_API_KEY is not set.");
    this.name = "BalldontlieNotConfiguredError";
  }
}

// ---- API response types (only the fields we use) ----
export interface BdlTeam {
  id: number;
  conference: string | null;
  division: string | null;
  city: string | null;
  name: string;
  full_name: string;
  abbreviation: string;
}
export interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height: string | null;
  weight: string | null;
  jersey_number: string | null;
  college: string | null;
  country: string | null;
  draft_year: number | null;
  team: BdlTeam | null;
}
export interface BdlGame {
  id: number;
  date: string; // "2025-01-05"
  season: number;
  status: string;
  status_state?: string; // scheduled | in_progress | final | postponed | ...
  period: number;
  time: string | null;
  postseason: boolean;
  home_team_score: number;
  visitor_team_score: number;
  datetime: string | null; // ISO
  home_team: BdlTeam;
  visitor_team: BdlTeam;
}
export interface BdlStat {
  id: number;
  min: string | null; // "30" or "21:35"
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number;
  oreb: number; dreb: number; reb: number; ast: number; stl: number; blk: number;
  turnover: number; pf: number; pts: number;
  player: { id: number; first_name: string; last_name: string; position: string; team_id: number };
  team: { id: number };
  game: { id: number; date: string; season: number; status_state?: string; home_team_id: number; visitor_team_id: number };
}

interface Page<T> {
  data: T[];
  meta?: { next_cursor?: number; per_page?: number };
}

// ---- throttle + fetch ----
let lastReqAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const minGap = Math.ceil(60_000 / config.balldontlieRpm); // ms between requests
  const wait = lastReqAt + minGap - Date.now();
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
}

/** One authenticated GET with throttling and 429 backoff. `path` begins with "/". */
async function get<T>(path: string, params: URLSearchParams, endpointLabel: string): Promise<Page<T>> {
  if (!config.balldontlieApiKey) throw new BalldontlieNotConfiguredError();
  const url = `${BASE}${path}${params.toString() ? `?${params}` : ""}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { Authorization: config.balldontlieApiKey, accept: "application/json" },
    });
    if (res.status === 401) throw new BalldontlieAuthError(endpointLabel);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`balldontlie ${endpointLabel} failed: HTTP ${res.status}`);
    return (await res.json()) as Page<T>;
  }
  throw new Error(`balldontlie ${endpointLabel} failed after retries (rate limited).`);
}

/** Follow `meta.next_cursor` until exhausted or `maxPages` reached. */
async function getAll<T>(path: string, baseParams: URLSearchParams, endpointLabel: string, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams(baseParams);
    params.set("per_page", "100");
    if (cursor !== undefined) params.set("cursor", String(cursor));
    const res = await get<T>(path, params, endpointLabel);
    out.push(...res.data);
    cursor = res.meta?.next_cursor;
    if (cursor === undefined || res.data.length === 0) break;
  }
  return out;
}

// ---- public fetchers ----

/** All NBA teams (the 30 franchises come back among a few historical entries). */
export async function fetchTeams(): Promise<BdlTeam[]> {
  const res = await get<BdlTeam>("/teams", new URLSearchParams(), "teams");
  return res.data;
}

/**
 * Current active players for the given teams. ALL-STAR tier or higher only; on Free
 * it throws BalldontlieAuthError. We use this rather than GET /players because the
 * plain endpoint returns every player a team has ever had (a historical dump), not
 * the current roster.
 */
export async function fetchActivePlayers(teamIds: number[]): Promise<BdlPlayer[]> {
  const params = new URLSearchParams();
  for (const id of teamIds) params.append("team_ids[]", String(id));
  return getAll<BdlPlayer>("/players/active", params, "players/active", 30);
}

/** Games within [startDate, endDate] (inclusive, YYYY-MM-DD). */
export async function fetchGames(startDate: string, endDate: string): Promise<BdlGame[]> {
  const params = new URLSearchParams();
  params.set("start_date", startDate);
  params.set("end_date", endDate);
  return getAll<BdlGame>("/games", params, "games", 20);
}

/**
 * Box-score rows for the given game ids. ALL-STAR tier or higher only; on Free it
 * throws BalldontlieAuthError, which the sync catches to skip real projections.
 */
export async function fetchStatsForGames(gameIds: number[]): Promise<BdlStat[]> {
  const out: BdlStat[] = [];
  const CHUNK = 25; // keep the query string bounded
  for (let i = 0; i < gameIds.length; i += CHUNK) {
    const params = new URLSearchParams();
    for (const id of gameIds.slice(i, i + CHUNK)) params.append("game_ids[]", String(id));
    out.push(...(await getAll<BdlStat>("/stats", params, "stats", 100)));
  }
  return out;
}

/** "21:35" or "30" -> minutes as a float. Empty/na -> 0. */
export function parseMinutes(min: string | null): number {
  if (!min) return 0;
  if (min.includes(":")) {
    const [m, s] = min.split(":");
    return Math.round((Number(m) + Number(s) / 60) * 10) / 10;
  }
  const n = Number(min);
  return Number.isFinite(n) ? n : 0;
}

/** Map balldontlie status_state to our game status enum. */
export function mapGameStatus(state: string | undefined): "scheduled" | "live" | "final" {
  if (state === "final") return "final";
  if (state === "in_progress") return "live";
  return "scheduled";
}

/** A model reference line near the player's recent average. Not a sportsbook line. */
export function toLine(avg: number): number {
  return Math.max(0.5, Math.floor(avg) + 0.5);
}

/** Fold a box score into the stat keys our analytics use (incl. pts+reb+ast). */
export function statLineFromBox(s: BdlStat): Record<string, number> {
  const pts = s.pts ?? 0;
  const reb = s.reb ?? 0;
  const ast = s.ast ?? 0;
  return { pts, reb, ast, threes: s.fg3m ?? 0, stl: s.stl ?? 0, blk: s.blk ?? 0, pra: pts + reb + ast };
}
