/**
 * Cross-platform market matcher. Only pairs markets whose settlement is
 * genuinely identical; everything else is left unmatched (never forced).
 *
 *  - Sports game winners: both venues encode (league, away, home, date). The
 *    Kalshi ticker concatenates the two team codes, so away/home are resolved
 *    by which of the event's two team codes is the prefix vs the suffix of that
 *    blob — unambiguous whatever the code lengths. Both settle on the game
 *    winner, so the markets are equivalent.
 *  - Named events: a curated registry of hand-verified equivalences.
 */
import type { PolyMarket } from "@/lib/data/providers/polymarket";

/** Kalshi team code -> Polymarket team code, only where they differ. */
const TEAM_ALIASES: Record<string, string> = {
  gsw: "gs", nor: "no", nos: "no", sas: "sa", nyk: "ny", tbl: "tb", tbr: "tb", wsh: "was", lvr: "lv", jac: "jax", gb: "gb", sf: "sf", kc: "kc",
};
const norm = (code: string) => {
  const c = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[c] ?? c;
};

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const LEAGUE_ALIAS: Record<string, string> = { nflgame: "nfl", nbagame: "nba", nhlgame: "nhl", mlbgame: "mlb" };
const league = (l: string) => LEAGUE_ALIAS[l] ?? l;

export interface KalshiGameParts {
  league: string;
  dateIso: string;
  blob: string; // concatenated away+home team codes
  teamCode: string; // the team this YES market is about
}

/** Parse e.g. KXNBAGAME-26NOV16ORLBOS-BOS -> league nba, date, blob "orlbos", team "bos". */
export function parseKalshiGame(ticker: string): KalshiGameParts | null {
  const m = /^KX([A-Z]+)GAME-(\d{2})([A-Z]{3})(\d{2})([A-Z0-9]+)-([A-Z0-9]{2,5})$/.exec(ticker);
  if (!m) return null;
  const [, lg, yy, mon, dd, blob, team] = m;
  const month = MONTHS[mon!];
  if (!month) return null;
  return { league: league(lg!.toLowerCase()), dateIso: `20${yy}-${month}-${dd}`, blob: blob!.toLowerCase(), teamCode: team!.toLowerCase() };
}

/** Event grouping key (ignores which team the market is about). */
export function kalshiEventKey(p: KalshiGameParts): string {
  return `${p.league}|${p.blob}|${p.dateIso}`;
}

/**
 * Resolve away/home from an event's two team codes and the shared blob:
 * away is the code that prefixes the blob, home the code that suffixes it.
 */
export function resolveAwayHome(blob: string, codeA: string, codeB: string): { away: string; home: string } | null {
  if (blob.startsWith(codeA) && blob.endsWith(codeB)) return { away: codeA, home: codeB };
  if (blob.startsWith(codeB) && blob.endsWith(codeA)) return { away: codeB, home: codeA };
  return null;
}

/** Canonical cross-venue match key for a game. */
export function gameMatchKey(leagueCode: string, away: string, home: string, dateIso: string): string {
  return `${league(leagueCode)}|${norm(away)}|${norm(home)}|${dateIso}`;
}

export function polyGameKey(p: PolyMarket): string | null {
  if (!p.game) return null;
  return gameMatchKey(p.game.league, p.game.away, p.game.home, p.game.dateIso);
}

/** Curated named-event equivalences (Kalshi YES ticker <-> Polymarket slug). */
export interface NamedPair {
  kalshiTicker: string;
  polySlugIncludes: string;
  label: string;
  invert?: boolean; // Polymarket outcome[0] is the NO of the Kalshi YES
}

export const NAMED_PAIRS: NamedPair[] = [
  { kalshiTicker: "KXNVDACEO-29JAN-JENS", polySlugIncludes: "no-new-ceo-of-nvidia", label: "Jensen Huang remains NVIDIA CEO through 2028" },
];

export function findPolyBySlug(polys: PolyMarket[], includes: string): PolyMarket | null {
  const needle = includes.toLowerCase();
  return polys.find((p) => p.slug.toLowerCase().includes(needle)) ?? null;
}
