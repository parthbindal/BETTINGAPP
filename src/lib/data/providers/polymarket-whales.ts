/**
 * Polymarket on-chain "whale" data (public v2 Data API + Gamma). No credentials.
 *
 *  - leaderboard: top traders by realized+unrealized profit over a time period.
 *    The period MUST be passed explicitly: with no `timePeriod` the API silently
 *    returns the 1-DAY board, so "the most profitable traders" became "today's
 *    biggest winners" and the whole cohort churned every day.
 *  - positions:   a wallet's current holdings (token, size, cost, value, PnL).
 *  - enrichment:  map each token to its outcome label + a coarse category.
 *
 * Everything here is confirmed, verifiable on-chain data, not inferred.
 */
const DATA = "https://data-api.polymarket.com";
const GAMMA = "https://gamma-api.polymarket.com";
const UA = { accept: "application/json", "user-agent": "edgewise-research/0.1" } as const;

async function getJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: UA, cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface LeaderEntry {
  rank: number;
  wallet: string;
  name: string;
  pnl: number;
  volume: number;
  xUsername: string | null;
  verified: boolean;
}

type RawLeader = { rank: number; user_id: string; user_name?: string; pnl: number; volume: number; x_username?: string; verified?: boolean };
/** Polymarket's leaderboard windows. `ALL` is all-time; the API default (no param) is `DAY`. */
export type LeaderboardPeriod = "ALL" | "MONTH" | "WEEK" | "DAY";
export async function fetchLeaderboard(topN: number, period: LeaderboardPeriod = "ALL"): Promise<LeaderEntry[]> {
  const limit = Math.min(1000, Math.max(1, topN));
  const res = await getJson<RawLeader[] | { data?: RawLeader[] }>(`${DATA}/v2/leaderboard?timePeriod=${period}&limit=${limit}`);
  const raw: RawLeader[] = Array.isArray(res) ? res : (res?.data ?? []);
  return raw.map((r) => ({
    rank: r.rank,
    wallet: r.user_id,
    name: r.user_name && !r.user_name.startsWith("0x") ? r.user_name : `${r.user_id.slice(0, 6)}…${r.user_id.slice(-4)}`,
    pnl: r.pnl ?? 0,
    volume: r.volume ?? 0,
    xUsername: r.x_username || null,
    verified: Boolean(r.verified),
  }));
}

export interface RawPosition {
  wallet: string;
  tokenId: string;
  conditionId: string;
  title: string;
  outcome: string;
  eventSlug: string | null;
  marketSlug: string | null; // the specific question inside the event
  endDate: string | null; // YYYY-MM-DD
  category: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number; // cost basis of the open position, USDC
  unrealizedPnl: number;
  realizedPnl: number;
  firstEntryAt: number | null; // ms since epoch
  lastEventAt: number | null; // ms since epoch
}

/** The API reports times as Unix seconds; keep milliseconds internally. */
const secondsToMs = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

export async function fetchPositions(wallet: string, limit = 200): Promise<RawPosition[]> {
  const res = await getJson<Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>> }>(`${DATA}/v2/positions?user=${wallet}&limit=${limit}`);
  const arr = Array.isArray(res) ? res : (res?.data ?? []);
  const out: RawPosition[] = [];
  for (const p of arr) {
    if (p.archived) continue;
    const currentValue = Number(p.current_value) || 0;
    if (currentValue < 100) continue; // ignore dust
    const title = String(p.title ?? "");
    const eventSlug = p.event_slug ? String(p.event_slug) : null;
    const marketSlug = p.slug ? String(p.slug) : null;
    out.push({
      wallet,
      tokenId: String(p.token_id),
      conditionId: String(p.condition_id),
      title,
      outcome: String(p.outcome ?? ""),
      eventSlug,
      marketSlug,
      endDate: p.end_date ? String(p.end_date) : null,
      category: classifyMarket(title, eventSlug ?? ""),
      shares: Number(p.current_size) || 0,
      avgPrice: Number(p.avg_price) || 0,
      currentPrice: Number(p.current_price) || 0,
      currentValue,
      totalCost: Number(p.total_cost_usdc) || 0,
      unrealizedPnl: Number(p.unrealized_pnl) || 0,
      realizedPnl: Number(p.realized_pnl) || 0,
      firstEntryAt: secondsToMs(p.first_entry_at),
      lastEventAt: secondsToMs(p.last_event_at),
    });
  }
  return out;
}

export interface MarketMeta {
  conditionId: string;
  question: string;
  category: string;
  endDate: string | null;
  slug: string | null; // event slug for a direct polymarket.com/event/<slug> link
  marketSlug: string | null; // market slug: polymarket.com/event/<slug>/<marketSlug> lands on this question
  tokenOutcome: Record<string, string>; // token_id -> outcome label
}

function classify(question: string, eventTicker: string | undefined): string {
  const e = (eventTicker ?? "").toLowerCase();
  if (/^(nba|nfl|nhl|mlb|ncaa|epl|uefa|laliga|wnba|atp|wta|ufc|f1|soccer|mls)/.test(e)) return "Sports";
  const q = question.toLowerCase();
  if (/\b(election|president|presidential|nomination|nominee|democratic|republican|primary|senate|governor|mayor|congress|speaker|parliament|prime minister|poll|cabinet|impeach)\b/.test(q)) return "Politics";
  if (/\b(bitcoin|btc|ethereum|eth|solana|crypto|xrp|dogecoin)\b/.test(q)) return "Crypto";
  if (/\b(fed|inflation|cpi|interest rate|gdp|recession|jobs report|unemployment)\b/.test(q)) return "Economics";
  if (/\b(vs\.?|beat|win|game|match|cup|championship|super bowl|playoff)\b/.test(q)) return "Sports";
  return "Other";
}

/** Enrich a set of condition ids -> per-token outcome labels and category. Chunked via repeated params. */
export async function fetchMarketMeta(conditionIds: string[]): Promise<Map<string, MarketMeta>> {
  const out = new Map<string, MarketMeta>();
  const unique = [...new Set(conditionIds)];
  const chunk = 20;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const qs = slice.map((c) => `condition_ids=${encodeURIComponent(c)}`).join("&");
    let markets: Array<Record<string, unknown>> = [];
    try {
      markets = await getJson<Array<Record<string, unknown>>>(`${GAMMA}/markets?${qs}&limit=${chunk}`);
    } catch {
      continue;
    }
    for (const m of Array.isArray(markets) ? markets : []) {
      let outcomes: string[] = [];
      let tokens: string[] = [];
      try {
        outcomes = JSON.parse(String(m.outcomes ?? "[]"));
        tokens = JSON.parse(String(m.clobTokenIds ?? "[]"));
      } catch {
        /* ignore */
      }
      const tokenOutcome: Record<string, string> = {};
      tokens.forEach((t, idx) => (tokenOutcome[t] = outcomes[idx] ?? "?"));
      const ev = (m.events as Array<{ ticker?: string; slug?: string }> | undefined)?.[0];
      out.set(String(m.conditionId), {
        conditionId: String(m.conditionId),
        question: String(m.question ?? ""),
        category: classify(String(m.question ?? ""), ev?.ticker),
        endDate: (m.endDateIso as string) ?? null,
        slug: ev?.slug ?? (m.slug as string) ?? null,
        marketSlug: (m.slug as string) ?? null,
        tokenOutcome,
      });
    }
  }
  return out;
}

export interface MarketResolution {
  closed: boolean;
  /** token_id -> settlement price. A settled binary market pays 1 on one side and 0 on the other. */
  priceByToken: Record<string, number>;
}

/**
 * Settlement prices for a set of condition ids, for scoring the signal ledger.
 *
 * `closed=true` is required and is load-bearing: Gamma's /markets filters to
 * open markets by default and silently returns an EMPTY array for a settled
 * condition id, which reads identically to "not resolved yet". Querying only
 * closed markets inverts that into something safe -- a condition id missing
 * from the response simply has not settled.
 *
 * Note that closed is still not proof of a payout: cancelled markets (and some
 * pre-CLOB ones from 2020-21) come back closed with BOTH sides at 0. This
 * returns the raw prices and lets the caller decide; scoreSignals() treats an
 * all-zero market as void rather than as a loss.
 */
export async function fetchMarketResolutions(conditionIds: string[]): Promise<Map<string, MarketResolution>> {
  const out = new Map<string, MarketResolution>();
  const unique = [...new Set(conditionIds)];
  const chunk = 20;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const qs = slice.map((c) => `condition_ids=${encodeURIComponent(c)}`).join("&");
    let markets: Array<Record<string, unknown>> = [];
    try {
      markets = await getJson<Array<Record<string, unknown>>>(`${GAMMA}/markets?${qs}&closed=true&limit=${chunk}`);
    } catch {
      continue; // a chunk that fails is retried on the next run, not guessed at
    }
    for (const m of Array.isArray(markets) ? markets : []) {
      let tokens: string[] = [];
      let prices: string[] = [];
      try {
        tokens = JSON.parse(String(m.clobTokenIds ?? "[]"));
        prices = JSON.parse(String(m.outcomePrices ?? "[]"));
      } catch {
        continue;
      }
      const priceByToken: Record<string, number> = {};
      tokens.forEach((t, idx) => {
        const p = Number(prices[idx]);
        if (Number.isFinite(p)) priceByToken[t] = p;
      });
      out.set(String(m.conditionId), { closed: Boolean(m.closed), priceByToken });
    }
  }
  return out;
}

export interface RawTrade {
  wallet: string;
  ts: number; // unix seconds
  side: "BUY" | "SELL";
  outcome: string;
  title: string;
  usd: number; // dollar size of the trade
  price: number; // 0..1
  conditionId: string;
  tokenId: string;
  eventSlug: string;
  marketSlug: string | null;
  category: string;
  txHash: string | null; // Polygon transaction, for verification
  name?: string; // the trader's Polymarket display name, when the feed carries it
}

/** Coarse market category from its title and event slug (no extra API calls). */
export function classifyMarket(title: string, eventSlug: string): string {
  const e = (eventSlug ?? "").toLowerCase();
  if (/^(nba|nfl|nhl|mlb|ncaa|epl|uefa|laliga|wnba|atp|wta|ufc|f1|soccer|mls)/.test(e)) return "Sports";
  const q = title.toLowerCase();
  if (/\b(election|president|presidential|nomination|nominee|democratic|republican|primary|senate|governor|mayor|congress|speaker|parliament|prime minister|poll|cabinet|impeach)\b/.test(q)) return "Politics";
  if (/\b(bitcoin|btc|ethereum|eth|solana|crypto|xrp|dogecoin)\b/.test(q)) return "Crypto";
  if (/\b(fed|inflation|cpi|interest rate|gdp|recession|jobs report|unemployment)\b/.test(q)) return "Economics";
  if (/\b(vs\.?|beat|win|spread|game|match|cup|championship|super bowl|playoff|o\/u)\b/.test(q)) return "Sports";
  return "Other";
}

/**
 * A trader's most recent trades (buys and sells), newest first. `sinceSec`
 * (Unix seconds) limits the result to trades at or after that time. The API
 * returns at most 1,000 per call and does not paginate with offsets.
 */
export async function fetchRecentTrades(wallet: string, limit = 40, sinceSec?: number): Promise<RawTrade[]> {
  const since = sinceSec ? `&start=${Math.floor(sinceSec)}` : "";
  const res = await getJson<Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>> }>(`${DATA}/v2/trades?user=${wallet}&limit=${Math.min(1000, limit)}${since}`);
  const arr = Array.isArray(res) ? res : (res?.data ?? []);
  return arr.map((t) => toRawTrade(t, wallet)).filter((t): t is RawTrade => t !== null);
}

/**
 * The newest trades of at least `minUsd`, across all of Polymarket or for one
 * wallet, both sides of every fill (makers too: a whale filling resting limit
 * orders never shows up as a taker). The size filter runs on Polymarket's
 * side, which is what makes polling the whole market cheap, but with it the
 * API ignores `start`, so callers filter by time themselves. One call returns
 * at most 1,000 rows, roughly half a day of $10K+ trades.
 */
export async function fetchBigTrades(minUsd: number, opts: { wallet?: string; limit?: number } = {}): Promise<RawTrade[]> {
  const user = opts.wallet ? `&user=${opts.wallet}` : "";
  const res = await getJson<Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>> }>(
    `${DATA}/v2/trades?limit=${Math.min(1000, opts.limit ?? 1000)}&takerOnly=false&filterType=CASH&filterAmount=${Math.round(minUsd)}${user}`,
  );
  const arr = Array.isArray(res) ? res : (res?.data ?? []);
  return arr.map((t) => toRawTrade(t)).filter((t): t is RawTrade => t !== null);
}

/** One v2 trade record, or null when it is not a buy or a sell. `wallet` overrides the record's own proxy wallet. */
function toRawTrade(t: Record<string, unknown>, wallet?: string): RawTrade | null {
  const side = String(t.side ?? "").toUpperCase();
  if (side !== "BUY" && side !== "SELL") return null;
  const price = Number(t.price) || 0;
  const shares = Number(t.size) || 0;
  const usd = Number(t.usdc_size) || shares * price;
  const title = String(t.title ?? "");
  const eventSlug = String(t.event_slug ?? "");
  const name = String(t.name ?? "") || String(t.pseudonym ?? "");
  return {
    wallet: wallet ?? String(t.proxy_wallet ?? ""),
    ts: Number(t.timestamp) || 0,
    side: side as "BUY" | "SELL",
    outcome: String(t.outcome ?? ""),
    title,
    usd,
    price,
    conditionId: String(t.condition_id ?? ""),
    tokenId: String(t.token_id ?? ""),
    eventSlug,
    marketSlug: t.slug ? String(t.slug) : null,
    // The v2 feed often leaves event_slug empty; the market slug carries the same league prefix.
    category: classifyMarket(title, eventSlug || String(t.slug ?? "")),
    txHash: t.transaction_hash ? String(t.transaction_hash) : null,
    ...(name ? { name } : {}),
  };
}
