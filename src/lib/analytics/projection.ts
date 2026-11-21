/**
 * Projection analysis: compares a statistical line against a player's game
 * logs with explicit sample sizes, variance, splits and uncertainty.
 * Model version proj-v0.1 (transparent heuristics; no learned weights).
 */
import { describe, histogram, hitRate, mean, stdev, ewma } from "@/lib/analytics/stats";
import { probOver, shrunkFrequency, wilsonInterval } from "@/lib/analytics/probability";

export const PROJECTION_MODEL_VERSION = "proj-v0.1";

export interface LogPoint {
  date: string;
  value: number;
  minutes: number;
  isHome: boolean;
  opponentId: string;
  opponentName: string;
  opponentDefRating: number | null;
}

export interface ProjectionAnalysis {
  modelVersion: string;
  stat: string;
  line: number;
  sampleSize: number;
  windows: Record<"season" | "last10" | "last5", ReturnType<typeof describe> & { overRate: number; overHits: number }>;
  distribution: Array<{ from: number; to: number; count: number }>;
  splits: {
    home: { n: number; mean: number; overRate: number };
    away: { n: number; mean: number; overRate: number };
    vsStrongDefense: { n: number; mean: number; overRate: number } | null;
    vsWeakDefense: { n: number; mean: number; overRate: number } | null;
  };
  minutes: { seasonMean: number; last5Mean: number; changePct: number };
  estimate: {
    probOver: number;
    probUnder: number;
    interval: { low: number; high: number };
    parametricProbOver: number;
    empiricalProbOver: number;
    weightedMean: number;
    sd: number;
    confidence: "low" | "medium" | "high";
  };
  flags: Array<{ level: "info" | "warning"; text: string }>;
  notes: string[];
}

export function analyzeProjection(points: LogPoint[], stat: string, line: number, opts: { injuryStatus?: string | null; opponentDefRating?: number | null; leagueDefMid?: number | null } = {}): ProjectionAnalysis {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((p) => p.value);
  const win = (xs: number[]) => {
    const d = describe(xs);
    const h = hitRate(xs, line, "over");
    return { ...d, overRate: h.rate, overHits: h.hits };
  };
  const season = values;
  const last10 = values.slice(-10);
  const last5 = values.slice(-5);

  const homePts = sorted.filter((p) => p.isHome).map((p) => p.value);
  const awayPts = sorted.filter((p) => !p.isHome).map((p) => p.value);
  const split = (xs: number[]) => ({ n: xs.length, mean: xs.length ? mean(xs) : NaN, overRate: xs.length ? hitRate(xs, line).rate : NaN });

  const defVals = sorted.map((p) => p.opponentDefRating).filter((x): x is number => x !== null);
  const defMid = opts.leagueDefMid ?? (defVals.length ? mean(defVals) : null);
  let vsStrong: ReturnType<typeof split> | null = null;
  let vsWeak: ReturnType<typeof split> | null = null;
  if (defMid !== null && defVals.length >= 6) {
    // lower defRating = better defense in our convention
    vsStrong = split(sorted.filter((p) => p.opponentDefRating !== null && p.opponentDefRating < defMid).map((p) => p.value));
    vsWeak = split(sorted.filter((p) => p.opponentDefRating !== null && p.opponentDefRating >= defMid).map((p) => p.value));
  }

  const minutesSeason = mean(sorted.map((p) => p.minutes));
  const minutesLast5 = mean(sorted.slice(-5).map((p) => p.minutes));
  const minutesChange = minutesSeason ? (minutesLast5 - minutesSeason) / minutesSeason : 0;

  // Estimate: blend a recency-weighted normal model with a shrunk empirical rate.
  const weightedMean = values.length ? 0.5 * mean(season) + 0.3 * mean(last10) + 0.2 * ewma(values, 0.35) : NaN;
  let sd = stdev(season);
  if (!sd || Number.isNaN(sd)) sd = Math.max(0.5, weightedMean * 0.35);
  // continuity correction for integer-valued stats: P(X > line) where line is x.5
  const parametric = values.length ? probOver(weightedMean, sd, line) : NaN;
  const seasonHits = hitRate(season, line).hits;
  const empirical = values.length ? shrunkFrequency(seasonHits, values.length, Number.isFinite(parametric) ? parametric : 0.5, 6) : NaN;
  const probOverEst = values.length ? Math.min(0.97, Math.max(0.03, 0.5 * parametric + 0.5 * empirical)) : NaN;
  const interval = wilsonInterval(seasonHits, values.length);

  const cv = weightedMean ? sd / weightedMean : Infinity;
  let confidence: "low" | "medium" | "high" = "low";
  if (values.length >= 20 && cv < 0.35 && Math.abs(minutesChange) < 0.12) confidence = "high";
  else if (values.length >= 10 && cv < 0.6) confidence = "medium";

  const flags: ProjectionAnalysis["flags"] = [];
  const notes: string[] = [];
  if (values.length < 10) flags.push({ level: "warning", text: `Small sample: only ${values.length} games. Hit rates swing wildly at this size.` });
  if (cv > 0.45) flags.push({ level: "warning", text: `High game-to-game variance (σ=${sd.toFixed(1)}, mean=${weightedMean.toFixed(1)}). Single-game outcomes are hard to call.` });
  if (Math.abs(minutesChange) > 0.12) flags.push({ level: "warning", text: `Playing time changed ${(minutesChange * 100).toFixed(0)}% over the last 5 games vs season (${minutesLast5.toFixed(1)} vs ${minutesSeason.toFixed(1)} min).` });
  if (opts.injuryStatus && opts.injuryStatus !== "healthy") flags.push({ level: "warning", text: `Injury status: ${opts.injuryStatus}. Availability and role are uncertain.` });
  if (values.length && Math.abs(line - describe(season).median) > sd) flags.push({ level: "info", text: `The line (${line}) sits more than one standard deviation from the season median (${describe(season).median}).` });
  if (opts.opponentDefRating !== null && opts.opponentDefRating !== undefined && defMid !== null) {
    const strong = opts.opponentDefRating < defMid;
    flags.push({ level: "info", text: `Upcoming opponent rates as a ${strong ? "stronger" : "weaker"}-than-average defense (${opts.opponentDefRating.toFixed(1)} vs league mid ${defMid.toFixed(1)}).` });
  }
  notes.push("Recent performance is weighted but does not predict the future perfectly; regression toward the season mean is the base case.");
  notes.push("Probability estimates assume game logs are representative of the next game's role, minutes and matchup, which is often not true.");

  return {
    modelVersion: PROJECTION_MODEL_VERSION,
    stat,
    line,
    sampleSize: values.length,
    windows: { season: win(season), last10: win(last10), last5: win(last5) },
    distribution: values.length ? histogram(values, weightedMean >= 20 ? 5 : weightedMean >= 8 ? 2 : 1) : [],
    splits: { home: split(homePts), away: split(awayPts), vsStrongDefense: vsStrong, vsWeakDefense: vsWeak },
    minutes: { seasonMean: minutesSeason, last5Mean: minutesLast5, changePct: minutesChange },
    estimate: { probOver: probOverEst, probUnder: 1 - probOverEst, interval, parametricProbOver: parametric, empiricalProbOver: empirical, weightedMean, sd, confidence },
    flags,
    notes,
  };
}
