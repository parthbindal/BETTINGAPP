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

/** Replies that mean "busy, ask again shortly" rather than "no". */
const RETRYABLE = new Set([429, 502, 503, 504]);

/** How long to wait before asking again: the server's Retry-After when it gives one (capped), else 1.5 s. */
function retryDelayMs(r: Response): number {
  const after = Number(r.headers.get("retry-after"));
  return Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5_000) : 1_500;
}

/**
 * GET a JSON endpoint. A busy reply is retried `retries` times after a short
 * pause; any other failure throws at once, carrying the status and URL.
 */
async function getJson<T>(url: string, { timeoutMs = 20_000, retries = 1 }: { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: UA, cache: "no-store", signal: ctrl.signal });
      if (r.ok) return (await r.json()) as T;
      if (attempt < retries && RETRYABLE.has(r.status)) {
        await new Promise((res) => setTimeout(res, retryDelayMs(r)));
        continue;
      }
      throw new Error(`${r.status} ${url}`);
    } finally {
      clearTimeout(timer);
    }
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

/**
 * The leaderboard URL. Public and CORS-open (`access-control-allow-origin: *`),
 * so the browser polls it directly for live ranks (see live-board.tsx) without
 * costing a server invocation or a database wake.
 */
export function leaderboardUrl(period: LeaderboardPeriod, topN: number): string {
  return `${DATA}/v2/leaderboard?timePeriod=${period}&limit=${Math.min(1000, Math.max(1, Math.round(topN)))}`;
}

/** One leaderboard row, or null when it is malformed (the browser reads this API directly, so nothing is trusted). */
function toLeaderEntry(r: RawLeader): LeaderEntry | null {
  if (!r || typeof r.user_id !== "string" || !Number.isFinite(Number(r.rank))) return null;
  return {
    rank: Number(r.rank),
    wallet: r.user_id,
    name: r.user_name && !r.user_name.startsWith("0x") ? r.user_name : `${r.user_id.slice(0, 6)}…${r.user_id.slice(-4)}`,
    pnl: Number(r.pnl) || 0,
    volume: Number(r.volume) || 0,
    xUsername: r.x_username || null,
    verified: Boolean(r.verified),
  };
}

/** Parse a leaderboard response, in either of the shapes the API has returned. */
export function parseLeaderboard(res: unknown): LeaderEntry[] {
  const raw = Array.isArray(res) ? res : ((res as { data?: unknown } | null)?.data ?? []);
  return Array.isArray(raw) ? raw.map((r) => toLeaderEntry(r as RawLeader)).filter((r): r is LeaderEntry => r !== null) : [];
}

export async function fetchLeaderboard(topN: number, period: LeaderboardPeriod = "ALL"): Promise<LeaderEntry[]> {
  return parseLeaderboard(await getJson<unknown>(leaderboardUrl(period, topN)));
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
  totalCost: number; // cost basis of the open position including fees, USDC
  entryCost: number; // the same cost without fees: Polymarket's own % P&L is unrealizedPnl / entryCost
  unrealizedPnl: number; // currentValue - entryCost, as Polymarket reports it
  realizedPnl: number;
  firstEntryAt: number | null; // ms since epoch
  lastEventAt: number | null; // ms since epoch
}

/** The API reports times as Unix seconds; keep milliseconds internally. */
const secondsToMs = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

/** Positions below this current value are dust and never read. */
export const MIN_POSITION_USD = 100;

type PositionsPage = Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>>; pagination?: { has_more?: boolean; next_cursor?: string | null } };

/**
 * Every open position worth MIN_POSITION_USD or more, read page by page: a
 * page used to be capped at 200 rows, and the busiest wallets hold more than
 * 200 positions of $100+ (one held 845), so their exposure was undercounted.
 *
 * First choice is the API's own value filter (`filterType=CASH`), which keeps
 * responses small. But it checks every position a wallet ever held, so for a
 * wallet with hundreds of worthless leftovers it takes ~5 s and Polymarket
 * answers 503. Those wallets are read unfiltered instead: that list is fast and
 * sorted by value, so reading stops at the first page that ends below the floor.
 */
export async function fetchPositions(wallet: string, opts: { pageSize?: number; maxPages?: number } = {}): Promise<RawPosition[]> {
  try {
    return await readPositions(wallet, true, Math.min(500, opts.pageSize ?? 500), opts.maxPages ?? 4);
  } catch {
    return readPositions(wallet, false, 200, opts.maxPages ?? 8);
  }
}

async function readPositions(wallet: string, filtered: boolean, pageSize: number, maxPages: number): Promise<RawPosition[]> {
  const filter = filtered ? `&filterType=CASH&filterAmount=${MIN_POSITION_USD}` : "";
  const out: RawPosition[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const next: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    // The value filter's 503 is a server-side timeout that a retry would only repeat;
    // fetchPositions falls back to the unfiltered read instead.
    const res: PositionsPage = await getJson<PositionsPage>(`${DATA}/v2/positions?user=${wallet}&limit=${pageSize}${filter}${next}`, { retries: filtered ? 0 : 1 });
    const arr = Array.isArray(res) ? res : (res?.data ?? []);
    out.push(...toPositions(wallet, arr));
    // Unfiltered pages are sorted by value, so one ending below the floor is the last that matters.
    const lastValue = Number(arr[arr.length - 1]?.current_value) || 0;
    cursor = !Array.isArray(res) && res?.pagination?.has_more ? (res.pagination.next_cursor ?? null) : null;
    if (!cursor || !arr.length || (!filtered && lastValue < MIN_POSITION_USD)) break;
  }
  return out;
}

function toPositions(wallet: string, arr: Array<Record<string, unknown>>): RawPosition[] {
  const out: RawPosition[] = [];
  for (const p of arr) {
    if (p.archived) continue;
    // A settled market the trader has not cashed out yet: the bet is done, not open. Polymarket
    // flags it both ways (status REDEEMABLE, redeemable true). On 2026-11-25 these were 349 of
    // 3,716 "open" positions across 12 busy wallets, inflating exposure and turning finished
    // games into 97c+ "signals".
    if (p.redeemable === true || String(p.status ?? "").toUpperCase() === "REDEEMABLE") continue;
    const currentValue = Number(p.current_value) || 0;
    if (currentValue < MIN_POSITION_USD) continue; // the API already filters; kept in case it ever stops
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
      entryCost: Number(p.entry_cost_usdc) || Number(p.total_cost_usdc) || 0,
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

const DAY_MS = 86_400_000;

/**
 * Markets worth asking Polymarket about: those whose end date is real (Polymarket
 * sends "1970-01-01" for "none") and no later than two days from now. A finished
 * game is always in this set; a market ending in 2028 cannot have closed yet.
 * The end date only picks what to ask: whether a market is over is Polymarket's
 * answer, because many stay open long past their stated end date.
 */
export function closedMarketCandidates(positions: Array<Pick<RawPosition, "conditionId" | "endDate">>, now = Date.now()): string[] {
  const ids = new Set<string>();
  for (const p of positions) {
    if (!p.endDate) continue;
    const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(p.endDate) ? `${p.endDate}T00:00:00Z` : p.endDate);
    if (Number.isFinite(t) && t > Date.UTC(2000, 0, 1) && t <= now + 2 * DAY_MS) ids.add(p.conditionId);
  }
  return [...ids];
}

/**
 * Markets among these positions that Polymarket reports closed: trading has
 * stopped, so the bet is finished even though it is not settled (REDEEMABLE)
 * yet. That is the window between a game ending and its payout. Asked in
 * parallel batches so an hourly scan of ~1,200 candidate markets takes seconds.
 * A batch that fails keeps its markets: never drop a bet on a guess.
 */
export async function closedMarketIds(positions: Array<Pick<RawPosition, "conditionId" | "endDate">>, now = Date.now()): Promise<Set<string>> {
  const ids = closedMarketCandidates(positions, now);
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) groups.push(ids.slice(i, i + 200));
  const results = await Promise.all(groups.map((g) => fetchMarketResolutions(g).catch(() => new Map<string, MarketResolution>())));
  const closed = new Set<string>();
  for (const r of results) for (const [id, m] of r) if (m.closed) closed.add(id);
  return closed;
}

/** Polymarket US's public market API (no key): https://docs.polymarket.us/api-reference/markets/get-markets */
const US_GATEWAY = "https://gateway.polymarket.us/v1";

/**
 * Which of these international event slugs Polymarket US lists as an open
 * market, checked exactly, never guessed from wording.
 *
 * Polymarket US is a separate exchange. Its game markets carry the
 * international event slug: the US moneyline for "nfl-den-pit-2026-11-27" is
 * "aec-nfl-den-pit-2026-11-27", and polymarket.us/event/nfl-den-pit-2026-11-27
 * opens that game (verified 2026-11-26). Everything else it lists under its own
 * names ("2028 US Presidential Election Winner" / "JD Vance"), and matching
 * those by wording sent people to the wrong market, so they count as not
 * listed. On 2026-11-26 only 2 of the 194 live markets the top traders held
 * were on Polymarket US.
 *
 * Asked 40 slugs per request, 4 requests at a time. A failed batch lists
 * nothing: a missing button beats a button to a page that does not exist.
 */
export async function usListedEvents(eventSlugs: Array<string | null | undefined>): Promise<Set<string>> {
  const unique = [...new Set(eventSlugs.filter((s): s is string => Boolean(s)))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 40) batches.push(unique.slice(i, i + 40));
  const listed = new Set<string>();
  let next = 0;
  async function worker() {
    for (let b = next++; b < batches.length; b = next++) {
      const batch = batches[b]!;
      const qs = batch.map((s) => `slug=${encodeURIComponent(`aec-${s}`)}`).join("&");
      try {
        const r = await getJson<{ markets?: Array<{ slug?: string; active?: boolean; closed?: boolean }> }>(`${US_GATEWAY}/markets?limit=${batch.length}&${qs}`, { timeoutMs: 10_000 });
        for (const m of r.markets ?? []) if (m.slug?.startsWith("aec-") && m.active && !m.closed) listed.add(m.slug.slice(4));
      } catch {
        // Listed nothing for this batch; the next scan asks again.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
  return listed;
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
