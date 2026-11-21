import { db } from "@/lib/db";
import { getFeaturedMarkets, getMarketMovers, listMarkets, getCategoryCounts } from "@/lib/data/markets";
import { impliedProbability } from "@/lib/data/types";
import type { Prisma } from "@/generated/prisma/client";

export interface BriefContent {
  generatedAt: string;
  headline: string;
  featured: Array<{ ticker: string; title: string; yesSubTitle: string | null; prob: number | null; volume24h: number; category: string }>;
  movers: Array<{ ticker: string; title: string; yesSubTitle: string | null; from: number | null; to: number | null; delta: number }>;
  closingSoon: Array<{ ticker: string; title: string; yesSubTitle: string | null; prob: number | null; closeTime: string | null }>;
  categories: Array<{ category: string; count: number; volume24h: number }>;
  notes: string[];
}

function dateKey(kind: "daily" | "weekly", d = new Date()) {
  if (kind === "daily") return d.toISOString().slice(0, 10);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return `W${start.toISOString().slice(0, 10)}`;
}

/** Deterministic research summary built from cached market data (no model tokens). */
export async function generateBrief(kind: "daily" | "weekly") {
  const [featured, movers, closing, categories] = await Promise.all([
    getFeaturedMarkets(6),
    getMarketMovers(6),
    listMarkets({ sort: "closing", limit: 6, minVolume: 500 }),
    getCategoryCounts(),
  ]);
  const content: BriefContent = {
    generatedAt: new Date().toISOString(),
    headline: movers.length ? `${movers[0]!.market.title}${movers[0]!.market.yesSubTitle ? ` (${movers[0]!.market.yesSubTitle})` : ""} moved ${movers[0]!.delta > 0 ? "+" : ""}${(movers[0]!.delta * 100).toFixed(0)} pts` : "Markets were quiet",
    featured: featured.map((m) => ({ ticker: m.ticker, title: m.title, yesSubTitle: m.yesSubTitle, prob: impliedProbability(m), volume24h: m.volume24h, category: m.category })),
    movers: movers.map((x) => ({ ticker: x.market.ticker, title: x.market.title, yesSubTitle: x.market.yesSubTitle, from: x.market.previousPrice, to: x.market.lastPrice, delta: x.delta })),
    closingSoon: closing.items.map((m) => ({ ticker: m.ticker, title: m.title, yesSubTitle: m.yesSubTitle, prob: impliedProbability(m), closeTime: m.closeTime })),
    categories: categories.slice(0, 8),
    notes: [
      "All market figures are from Kalshi public data cached by EDGEWISE; see each market page for fetch time and rules.",
      "A large move is a prompt to find the news behind it, not a signal to act.",
    ],
  };
  const key = dateKey(kind);
  await db.brief.upsert({ where: { kind_dateKey: { kind, dateKey: key } }, create: { kind, dateKey: key, content: content as unknown as Prisma.InputJsonValue }, update: { content: content as unknown as Prisma.InputJsonValue } });
  return content;
}

export async function getLatestBrief(kind: "daily" | "weekly"): Promise<{ content: BriefContent; dateKey: string } | null> {
  const row = await db.brief.findFirst({ where: { kind }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  return { content: row.content as unknown as BriefContent, dateKey: row.dateKey };
}

/** Ensure today's brief exists (cheap; no LLM). */
export async function ensureDailyBrief() {
  const key = dateKey("daily");
  const existing = await db.brief.findUnique({ where: { kind_dateKey: { kind: "daily", dateKey: key } } });
  if (existing) return existing.content as unknown as BriefContent;
  return generateBrief("daily");
}
