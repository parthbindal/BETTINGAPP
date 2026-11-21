/** Public, SEO-friendly educational articles. Plain Markdown bodies. */
export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  body: string;
}

export const ARTICLES: Article[] = [
  {
    slug: "what-is-implied-probability",
    title: "What Is Implied Probability? A Plain-English Guide",
    excerpt: "Every price in a prediction market and every betting line hides a probability. Here is how to read it, why it is not the 'true' probability, and what the gap tells you.",
    category: "Fundamentals",
    body: `## The price is a probability

In a prediction market like Kalshi, a contract that pays $1 if an event happens trades between 0¢ and 100¢. If the YES side costs 62¢, the market is collectively saying there is roughly a **62% chance** the event happens. That number is the *implied probability*.

Sportsbooks express the same idea through odds. American odds of −150 imply 60% (150 ÷ 250). Odds of +200 imply 33.3% (100 ÷ 300). The formulas are mechanical, and you can convert between them with our free [odds converter](/tools/odds-converter).

## Why "implied" and not "true"

The market price is a *consensus under constraints*. It is shaped by:

- **Fees and the bid–ask spread.** You cannot buy at the midpoint. If YES is bid 61¢ and asked 63¢, the market's view sits somewhere in that 2¢ band.
- **The vig.** In a sportsbook, the implied probabilities of all outcomes add up to more than 100%. The excess is the book's margin. Removing it proportionally gives a "fair" probability.
- **Liquidity.** In thin markets a single $500 order can move the price several points. The price reflects whoever traded last, not necessarily a deep consensus.
- **Known biases.** Research on prediction markets repeatedly finds a mild *favorite–longshot bias*: contracts priced near 5% tend to be a little rich, and contracts near 95% a little cheap.

## Reading the gap

Suppose a market says 60% and an independent estimate says 68%. The 8-point difference is **not** free money. Ask:

1. Is the estimate better informed than the market, or just different?
2. After fees and the spread, how much of the gap survives?
3. How confident is the estimate? A model with a ±10 point error band cannot distinguish 60 from 68.
4. What would have to be true for the market to be right?

That reasoning habit is the whole skill. EDGEWISE is built to make it routine: every market page shows the implied probability, the spread, the liquidity, a transparent model estimate, and the uncertainty around it.

*Educational content only. Nothing here is financial advice or a recommendation to trade.*`,
  },
  {
    slug: "expected-value-explained",
    title: "Expected Value Explained Without the Jargon",
    excerpt: "Expected value is the average outcome if you could repeat a decision thousands of times. Learn the formula, the intuition, and the ways it misleads.",
    category: "Fundamentals",
    body: `## One formula

Expected value (EV) is the probability-weighted average of all outcomes.

For a binary contract that costs **P** and pays $1 if the event happens, with your probability estimate **q**:

> EV per contract = q × $1 − P

Buy a contract at 40¢ with a 50% estimate and EV is +10¢. Buy it at 55¢ and EV is −5¢. Try it in the [expected value calculator](/tools/expected-value).

## Why EV is powerful

EV separates *decision quality* from *outcome quality*. A +EV decision can lose; a −EV decision can win. Over many repetitions, EV is what you collect. Everything else is variance.

## Why EV is dangerous

- **Garbage in, garbage out.** EV is only as good as **q**. If your probability is wrong by 10 points, your EV is wrong by 10¢ per dollar.
- **Fees.** On Kalshi a taker fee of roughly 0.07 × P × (1 − P) per contract applies. At 50¢ that is about 2¢, which erases a "2-point edge" entirely.
- **Correlation.** Ten "+EV" positions on the same underlying event are one position with ten times the variance.
- **Ruin.** A positive EV strategy can still go bankrupt if stakes are too large relative to the bankroll. That is the point of the Kelly criterion and why the Academy teaches *risk management* before *edge*.

## The honest question

Instead of asking "is this +EV?" ask "**how confident am I in q, and what is the EV at the low end of my confidence range?**" If it is still positive after fees, you have found something worth researching further. If not, you have found a market that is probably efficient.

*Educational content only.*`,
  },
  {
    slug: "how-kalshi-markets-work",
    title: "How Kalshi Prediction Markets Work: Prices, Resolution, and Fees",
    excerpt: "A step-by-step tour of a regulated prediction market: event contracts, the order book, resolution criteria, and what happens at expiration.",
    category: "Markets",
    body: `## Event contracts

Kalshi is a CFTC-regulated exchange where people trade **event contracts**: binary YES/NO contracts that settle at $1 or $0 based on whether a defined event occurs. Markets cover economics (inflation prints, Fed decisions), politics, weather, science, entertainment, and more.

## The order book

Each market has YES and NO sides. A YES bid at 62¢ is equivalent to a NO ask at 38¢. The **mid price** between the best bid and best ask is the market's implied probability. The **spread** between them measures how much the market disagrees with itself; a 1¢ spread is a confident market, a 10¢ spread is not.

## Resolution criteria matter more than you think

Every market has **rules** describing exactly what counts. "Will inflation exceed 3%?" sounds simple until you ask: which index, which month, headline or core, first print or revised? Many surprising "losses" come from reading the headline and skipping the rules. EDGEWISE shows the primary and secondary rules and the settlement source on every market page.

## Timing

Markets have an **open time**, a **close time** (trading stops), and an **expiration** (settlement). Some close early when the outcome becomes known. Prices often move most in the final hours as information arrives.

## Fees

Kalshi charges fees that depend on the contract price; the standard formula is roughly 0.07 × price × (1 − price) per contract, rounded up to the cent, paid by the party taking liquidity. Fee schedules vary by series, so always check the contract terms.

## Reading history

A probability chart over time tells you how the market's view evolved and when it jumped. Those jumps usually line up with news or data releases. Studying them teaches you what the market cares about.

*EDGEWISE displays public Kalshi market data for educational analysis. It does not execute trades, hold funds, or provide financial advice.*`,
  },
  {
    slug: "sports-projections-what-they-mean",
    title: "Sports Projections: What a 24.5-Point Line Actually Means",
    excerpt: "Projections look like predictions but behave like medians. Learn how to read them, why sample size matters, and the questions to ask before trusting one.",
    category: "Sports Analytics",
    body: `## A line is a median, not a forecast

When a projection says "24.5 points", it is not saying the player will score 24 or 25. It is set so that roughly half of outcomes land above and half below, after the line-setter accounts for matchup, minutes, and recent form. Think of it as a **median under uncertainty**.

## The questions that matter

1. **Sample size.** Twelve games tell you less than sixty. A 58% hit rate over 12 games has a confidence interval wide enough to include 30% and 80%.
2. **Variance.** A player averaging 24 with a standard deviation of 4 is very different from one averaging 24 with a standard deviation of 9. The second player's single-game outcome is close to a coin flip around any line near the mean.
3. **Minutes.** Production scales with playing time. If minutes dropped 15% over the last five games, every per-game stat is affected.
4. **Role and lineup.** Injuries to teammates change usage. A projection built on the season average may be stale.
5. **Opponent and pace.** More possessions mean more opportunities. A strong opposing defense suppresses efficiency.
6. **Home and away.** Modest but real effects in most sports.

## Recent form is overrated

Recent games carry information, but a hot streak is mostly noise. The best simple estimate is usually a **weighted blend** of season and recent averages with regression toward the mean, which is exactly what EDGEWISE's projection analysis computes and shows, with the weights visible.

## Hit rates are not probabilities

"Over in 7 of the last 10" is a description of the past. Converting it into a probability requires shrinking it toward a sensible prior and widening it for small samples. The Academy's *Sample sizes* and *Bayesian reasoning* lessons cover how.

*Educational content only. EDGEWISE does not facilitate wagers.*`,
  },
  {
    slug: "brier-score-calibration",
    title: "Brier Scores and Calibration: How to Know If Your Predictions Are Any Good",
    excerpt: "Accuracy alone can mislead. The Brier score and calibration curves tell you whether your probabilities mean what they say.",
    category: "Forecasting",
    body: `## Beyond "right or wrong"

If you say 70% and the event happens, were you right? Partly. If you say 70% on a hundred events and 70 happen, you were **calibrated**. If 90 happen, you were underconfident; if 50 happen, overconfident.

## The Brier score

The Brier score is the mean squared error between your probability and the outcome (1 or 0). Lower is better.

- Always saying 50%: 0.25
- Perfect foresight: 0.00
- Confidently wrong every time: 1.00

A forecaster who beats 0.25 is adding information. A **skill score** compares your Brier score with a reference, such as the market price at the time you forecast. Beating the market consistently is rare and is the real test.

## Log loss

Log loss punishes confident mistakes severely. Saying 99% and being wrong costs about 4.6; saying 60% and being wrong costs 0.9. It is the right metric when overconfidence is the failure mode you care about.

## Calibration curves

Bucket forecasts by predicted probability (0–10%, 10–20%, …) and plot the observed frequency in each bucket. Perfect calibration is the diagonal. Most people's curves are too flat: they say 80% when they should say 65%.

## Why EDGEWISE locks predictions

A tracker you can edit after the fact measures nothing. In EDGEWISE, a prediction is locked once its event resolves or its lock time passes, and the market and model probabilities at the time of the forecast are stored alongside it. That is what makes the Brier score honest.

*Educational content only.*`,
  },
  {
    slug: "responsible-analysis",
    title: "Responsible Analysis: Using Market Data Without Getting Hurt",
    excerpt: "Prediction markets and sports data are fascinating. They can also be harmful when treated as a path to easy money. Here is how we think about it.",
    category: "Responsible Use",
    body: `## What EDGEWISE is and is not

EDGEWISE is an educational and analytical tool. It does not place wagers, hold deposits, or promise returns. It exists to help you understand what probabilities, prices, and statistics mean.

## Principles we build around

- **No guaranteed-win language.** A probability difference is a research prompt, never a "lock".
- **Uncertainty is always displayed.** Every estimate ships with a confidence level and the inputs behind it.
- **Historical performance does not guarantee future results.** We say it everywhere because it is true everywhere.
- **Notifications inform; they do not pressure.** No countdown timers, no "act now".
- **Age and jurisdiction.** You must be 18 or older to create an account, and you are responsible for knowing the rules where you live. Real-money prediction market and sports wagering access varies by state and country.

## If gambling is a problem

If you or someone you know is struggling with gambling, help is available: in the United States call or text **1-800-GAMBLER**, or visit the National Council on Problem Gambling. EDGEWISE can be used fully without ever placing a bet, and we encourage exactly that.

*Educational content only.*`,
  },
];

export function getArticle(slug: string) {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
