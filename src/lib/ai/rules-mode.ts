/**
 * Rule-based analyst used when no AI provider is configured. Deterministic,
 * composes answers only from real tool output, and says so.
 */
import { runTool, type ToolContext } from "@/lib/ai/tools";
import type { SourceRef } from "@/lib/ai/analyst";
import { pct, cents, compact, relative } from "@/lib/format";

export const RULES_HEADER_UNCONFIGURED = `> **Rule-based mode.** No AI provider is configured, so this answer was assembled from live data by fixed rules rather than a language model. It cannot interpret free-form questions; the patterns it understands are listed at the end.\n\n`;
/** Shown when a provider IS configured but the live call failed (e.g. no API credits), so we fell back to rules. */
export const RULES_HEADER_PROVIDER_ERROR = `> **Rule-based mode.** The AI Analyst is configured, but the request to the AI provider could not be completed right now, so this answer was assembled from live data by fixed rules rather than a language model. It cannot interpret free-form questions; the patterns it understands are listed at the end.\n\n`;
const HEADER = RULES_HEADER_UNCONFIGURED;

const HELP = `**What I can do in this mode**
- \`explain KXTICKER-...\` — explain a Kalshi market by ticker
- \`markets about <topic>\` — search open markets
- \`movers\` — biggest recent price changes
- \`odds -150\` / \`odds 2.5\` — convert odds to implied probability
- \`ev p=0.55 price=0.40\` — expected value of a contract
- \`player <name>\` — find a player (demo data)
- \`analyze <playerId> <stat> <line>\` — projection analysis
- \`what is <concept>\` — look up an Academy lesson
- \`watchlist\` — show your watchlist

Set \`ANTHROPIC_API_KEY\` to enable the full AI Analyst.`;

export async function answerWithRules(message: string, ctx: ToolContext, header: string = HEADER): Promise<{ text: string; sources: SourceRef[] }> {
  const m = message.trim();
  const lower = m.toLowerCase();
  const sources: SourceRef[] = [];
  const src = (tool: string, ref: string, prov?: { source?: string; freshness?: string; fetchedAt?: string }) => sources.push({ tool, ref, ...prov });

  const ticker = m.match(/\b(KX[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/i)?.[1]?.toUpperCase();
  if (ticker) {
    const r = (await runTool("get_market", { ticker }, ctx)) as Record<string, unknown>;
    if ("error" in r) return { text: header + `I could not find market **${ticker}** in Kalshi public data.\n\n${HELP}`, sources };
    const mk = r.market as Record<string, unknown> & { provenance: { source: string; freshness: string; fetchedAt: string } };
    const model = r.model as Record<string, unknown>;
    src("get_market", ticker, mk.provenance);
    const lines = [
      header,
      `## ${mk.title}${mk.yesSubTitle ? ` — ${mk.yesSubTitle}` : ""}`,
      ``,
      `**Market (fact, ${mk.provenance.source}, ${mk.provenance.freshness}, fetched ${relative(mk.provenance.fetchedAt)})**`,
      `- Implied probability (mid): **${pct(mk.impliedProbability as number, 1)}** · bid ${cents(mk.yesBid as number)} / ask ${cents(mk.yesAsk as number)} · spread ${mk.spread !== null ? cents(mk.spread as number) : "n/a"}`,
      `- 24h volume ${compact(mk.volume24h as number)} · open interest ${compact(mk.openInterest as number)} · closes ${mk.closeTime ? relative(String(mk.closeTime)) : "—"}`,
      `- Approx. taker fee at this price: ${mk.approxTakerFeePerContract !== null ? cents(mk.approxTakerFeePerContract as number) : "—"} per contract`,
      ``,
      `**Resolution rules (verbatim)**`,
      `${mk.rulesPrimary ?? "Not provided."}`,
      ``,
      `**EDGEWISE model estimate (heuristic ${model.modelVersion as string}, ${model.confidence as string} confidence)**`,
      `- Estimate **${pct(model.estimate as number, 1)}** vs market ${pct(model.marketProb as number, 1)} → difference ${((model.diffPts as number) * 100).toFixed(1)} pts`,
      ...((model.explanation as string[]) ?? []).map((s) => `- ${s}`),
      ``,
      `**Caveats**`,
      ...((model.caveats as string[]) ?? []).map((s) => `- ${s}`),
      ``,
      `**Bottom line.** Known: the market's price, liquidity and rules above. Estimated: the heuristic model's number. Uncertain: whether either reflects the real-world probability; read the rules and recent news before forming a view.`,
      ``,
      `Educational analysis, not financial advice.`,
    ];
    return { text: lines.join("\n"), sources };
  }

  if (/\bmovers?\b|moving|biggest (moves|changes)/.test(lower)) {
    const r = (await runTool("get_market_movers", { limit: 8 }, ctx)) as Array<Record<string, unknown>>;
    r.forEach((x) => src("get_market_movers", String(x.ticker), x.provenance as never));
    const rows = r.map((x) => `| \`${x.ticker}\` | ${String(x.title).slice(0, 60)} | ${cents(x.previousPrice as number)} → ${cents(x.lastPrice as number)} | ${((x.deltaPts as number) * 100).toFixed(0)} pts | ${compact(x.volume24h as number)} |`);
    return { text: header + `## Biggest recent moves (Kalshi, cached public data)\n\n| Ticker | Market | Previous → Last | Δ | 24h vol |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nA large move usually follows news or a data release; check the resolution rules and recent developments before interpreting it.`, sources };
  }

  const search = lower.match(/(?:markets?|search|find)\s+(?:about|for|on)?\s*(.+)/);
  if (search && !lower.startsWith("what is")) {
    const q = search[1]!.trim();
    const r = (await runTool("search_markets", { query: q, limit: 8 }, ctx)) as { markets: Array<Record<string, unknown>> };
    if (!r.markets.length) return { text: header + `No open markets matched **${q}**.\n\n${HELP}`, sources };
    r.markets.forEach((x) => src("search_markets", String(x.ticker), x.provenance as never));
    const rows = r.markets.map((x) => `| \`${x.ticker}\` | ${String(x.title).slice(0, 70)} | ${pct(x.impliedProbability as number, 0)} | ${compact(x.volume24h as number)} |`);
    return { text: header + `## Markets matching "${q}"\n\n| Ticker | Market | Implied | 24h vol |\n|---|---|---|---|\n${rows.join("\n")}\n\nAsk \`explain <ticker>\` for rules, liquidity and the model estimate.`, sources };
  }

  const odds = lower.match(/odds\s+([+-]?\d+(?:\.\d+)?)/);
  if (odds) {
    const v = Number(odds[1]);
    const fmt = Math.abs(v) >= 100 ? "american" : "decimal";
    const r = (await runTool("convert_odds", { format: fmt, value: v }, ctx)) as Record<string, number | string>;
    return { text: header + `**${fmt === "american" ? "American" : "Decimal"} odds ${odds[1]}** → implied probability **${pct(r.impliedProbability as number, 1)}** · American ${r.american} · decimal ${(r.decimal as number).toFixed(3)}\n\n${r.note}`, sources };
  }

  const ev = lower.match(/ev\b.*?p\s*=\s*(0?\.\d+|\d+%).*?price\s*=\s*(0?\.\d+|\d+)/);
  if (ev) {
    const p = ev[1]!.includes("%") ? Number(ev[1]!.replace("%", "")) / 100 : Number(ev[1]);
    const priceRaw = Number(ev[2]);
    const price = priceRaw > 1 ? priceRaw / 100 : priceRaw;
    const r = (await runTool("compute_contract_ev", { probability: p, price, includeKalshiFee: true }, ctx)) as Record<string, number | string>;
    return { text: header + `**Expected value** at probability ${pct(p, 1)} and price ${cents(price)} (fee ≈ ${cents(r.feePerContract as number)}):\n\n- EV per $1 contract: **${((r.ev as number) * 100).toFixed(1)}¢** (${((r.evPercent as number) * 100).toFixed(1)}% of cost)\n- Break-even probability: ${pct(r.breakEvenProb as number, 1)}\n\n${r.note}\n\nEV is only as good as the probability you put in; stress-test it at the low end of your confidence range.`, sources };
  }

  const analyze = m.match(/analy[sz]e\s+(\S+)\s+(\w+)\s+([\d.]+)/i);
  if (analyze) {
    const r = (await runTool("analyze_projection", { playerId: analyze[1], stat: analyze[2], line: Number(analyze[3]) }, ctx)) as Record<string, unknown>;
    if ("error" in r) return { text: header + `Player **${analyze[1]}** was not found. Try \`player <name>\` first.`, sources };
    const a = r.analysis as Record<string, unknown>;
    const est = a.estimate as Record<string, number | string | { low: number; high: number }>;
    const w = a.windows as Record<string, { mean: number; median: number; stdev: number; overRate: number; n: number }>;
    const player = r.player as { name: string; isDemo: boolean };
    src("analyze_projection", String(analyze[1]), (r.provenance as never) ?? undefined);
    return {
      text:
        header +
        `## ${player.name} — ${r.statLabel as string} ${analyze[3]}${player.isDemo ? "\n\n**DEMO DATA:** this player and all statistics are fictional sample data." : ""}\n\n` +
        `| Window | Games | Mean | Median | σ | Over rate |\n|---|---|---|---|---|---|\n` +
        (["season", "last10", "last5"] as const).map((k) => `| ${k} | ${w[k]!.n} | ${w[k]!.mean.toFixed(1)} | ${w[k]!.median} | ${w[k]!.stdev.toFixed(1)} | ${pct(w[k]!.overRate, 0)} |`).join("\n") +
        `\n\n**Blended estimate:** P(over) ≈ **${pct(est.probOver as number, 0)}** (interval ${pct((est.interval as { low: number }).low, 0)}–${pct((est.interval as { high: number }).high, 0)}, ${est.confidence as string} confidence; model ${a.modelVersion as string}).\n\n` +
        `**Flags**\n${((a.flags as Array<{ text: string }>) ?? []).map((f) => `- ${f.text}`).join("\n") || "- None"}\n\n${((a.notes as string[]) ?? []).map((n) => `_${n}_`).join("\n")}`,
      sources,
    };
  }

  const player = lower.match(/^player\s+(.+)/);
  if (player) {
    const r = (await runTool("search_players", { query: player[1]!.trim(), limit: 8 }, ctx)) as { players: Array<Record<string, unknown>>; note?: string };
    if (!r.players.length) return { text: header + `No players matched **${player[1]}**.`, sources };
    return { text: header + (r.note ? `**${r.note}**\n\n` : "") + r.players.map((p) => `- **${p.name}** (${p.position}, ${p.team}) · id \`${p.playerId}\` · injury: ${p.injuryStatus}`).join("\n") + `\n\nUse \`analyze <id> <stat> <line>\` for a projection analysis.`, sources };
  }

  const concept = lower.match(/^(?:what is|what are|explain|teach me)\s+(.+?)\??$/);
  if (concept) {
    const r = (await runTool("get_lesson", { topic: concept[1]! }, ctx)) as Record<string, unknown>;
    if (!r.found) return { text: header + `The Academy does not have a lesson on **${concept[1]}** yet.\n\n${HELP}`, sources };
    return { text: header + `## ${r.title as string} (${r.level as string})\n\n${(r.body as string).split("\n").slice(0, 14).join("\n")}\n\n…continue in the Academy: [${r.href as string}](${r.href as string})`, sources };
  }

  if (/watchlist/.test(lower)) {
    const r = (await runTool("get_watchlist", {}, ctx)) as Array<Record<string, unknown>>;
    return { text: header + (r.length ? `## Your watchlist\n\n${r.map((i) => `- ${i.kind}: **${i.label}** (\`${i.refId}\`)`).join("\n")}` : "Your watchlist is empty."), sources };
  }

  return { text: header + HELP, sources };
}
