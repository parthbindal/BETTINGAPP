/**
 * Learning Academy curriculum. Lessons are Markdown; each has an optional
 * interactive example (rendered by the lesson page) and a short quiz.
 */
export type Level = "beginner" | "intermediate" | "advanced";

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number; // index
  why: string;
}

export interface Lesson {
  slug: string;
  title: string;
  minutes: number;
  summary: string;
  body: string;
  interactive?: "implied-probability" | "expected-value" | "variance" | "sample-size" | "calibration" | "monte-carlo" | "kelly" | "bayes";
  quiz: QuizQuestion[];
}

export interface Course {
  slug: string;
  level: Level;
  title: string;
  description: string;
  lessons: Lesson[];
}

export const COURSES: Course[] = [
  // ───────────── BEGINNER ─────────────
  {
    slug: "prediction-markets-101",
    level: "beginner",
    title: "Prediction Markets 101",
    description: "What prediction markets are, how Kalshi works, and how to read a market price as a probability.",
    lessons: [
      {
        slug: "what-are-prediction-markets",
        title: "What are prediction markets?",
        minutes: 6,
        summary: "Markets where people trade contracts on whether events will happen, producing a crowd probability.",
        body: `## A market for beliefs

A prediction market lets people buy and sell contracts tied to a yes-or-no question: *Will the Fed cut rates in December? Will it rain in Chicago tomorrow?* Each contract pays **$1** if the answer is YES and **$0** if NO.

Because traders put money behind their views, the price settles where buyers and sellers agree. A price of **35¢** means the crowd, in aggregate, thinks there is about a **35% chance**.

## Why they are interesting

- They aggregate scattered information quickly.
- They update continuously as news arrives.
- They are *scored*: a market's history of prices versus outcomes can be checked for calibration.

## What they are not

They are not oracles. Markets can be thin, biased, slow, or simply wrong. The skill you are building is to tell the difference.`,
        quiz: [
          { q: "A YES contract trades at 35¢. What does the market imply?", options: ["The event will not happen", "About a 35% chance the event happens", "A 65% chance the event happens", "Nothing; price is unrelated to probability"], answer: 1, why: "Price in cents maps directly to implied probability in percent for a $1 payout contract." },
          { q: "What does a YES contract pay if the event does not happen?", options: ["$1", "The purchase price", "$0", "50¢"], answer: 2, why: "Binary contracts settle at $1 or $0." },
          { q: "Which statement is most accurate?", options: ["Markets are always right", "Markets aggregate information but can be wrong", "Markets only reflect the last trade", "Markets ignore news"], answer: 1, why: "Markets are useful aggregators with known failure modes like thin liquidity and bias." },
        ],
      },
      {
        slug: "how-kalshi-works",
        title: "How Kalshi works",
        minutes: 7,
        summary: "Order books, YES/NO sides, close and expiration times, and resolution rules.",
        body: `## The exchange

Kalshi is a federally regulated exchange for event contracts. Every market has two sides: **YES** and **NO**. Buying YES at 62¢ is the same economic position as selling NO at 38¢.

## The order book

Traders post **bids** (what they will pay) and **asks** (what they will accept). The best bid and best ask bracket the market's view. The **mid price** is the best single-number summary; the **spread** between them is a measure of disagreement or illiquidity.

## Timing

- **Open time** — trading starts.
- **Close time** — trading stops.
- **Expiration** — the market settles based on the rules.

## Rules decide everything

Each market has primary and secondary rules and a **settlement source**. "Will CPI exceed 3%?" depends on which release, which month, and whether revisions count. Always read the rules before forming a view. In EDGEWISE every market page shows them verbatim from the exchange.`,
        quiz: [
          { q: "Buying YES at 62¢ is economically the same as…", options: ["Selling NO at 62¢", "Selling NO at 38¢", "Buying NO at 38¢", "Nothing else"], answer: 1, why: "YES and NO prices sum to $1." },
          { q: "What is the mid price?", options: ["Last trade", "Average of best bid and best ask", "Highest price today", "Settlement price"], answer: 1, why: "The midpoint between the best bid and best ask." },
          { q: "Why do resolution rules matter?", options: ["They set the fees", "They define exactly what counts as YES", "They are optional", "They predict the outcome"], answer: 1, why: "Markets resolve by their rules, not by headlines." },
        ],
      },
      {
        slug: "implied-probability",
        title: "What is implied probability?",
        minutes: 8,
        summary: "Turning prices and odds into probabilities, and why the result is 'implied', not 'true'.",
        interactive: "implied-probability",
        body: `## From price to probability

For a $1 contract, **implied probability = price**. 62¢ → 62%.

For sportsbook odds:

- American **−150** → 150 / (150 + 100) = **60%**
- American **+200** → 100 / (200 + 100) = **33.3%**
- Decimal **2.50** → 1 / 2.50 = **40%**

## The vig

Add up the implied probabilities of every outcome at a sportsbook and you get more than 100%. The excess is the **vig**, the book's margin. Dividing each probability by the total removes it proportionally.

## Implied is not true

The price includes fees, spread, liquidity effects and biases. Treat implied probability as the market's *opinion*, then ask what you know that the market might not.

Try the interactive converter below.`,
        quiz: [
          { q: "American odds of −200 imply roughly…", options: ["33%", "50%", "67%", "80%"], answer: 2, why: "200 / (200 + 100) = 66.7%." },
          { q: "If two outcomes' implied probabilities sum to 105%, the 5% is…", options: ["A rounding error", "The vig (bookmaker margin)", "Free value", "The spread"], answer: 1, why: "Overround above 100% is the book's margin." },
          { q: "Why is market probability called 'implied'?", options: ["It is derived from price and reflects constraints like fees", "It is always exactly correct", "It is set by regulators", "It is a guess"], answer: 0, why: "It is implied by the price, not an objective truth." },
        ],
      },
      {
        slug: "understanding-sports-projections",
        title: "Understanding sports projections",
        minutes: 7,
        summary: "What a stat line means, why it is a median, and the first questions to ask.",
        body: `## The line is a median

A projection like **24.5 points** is set so about half of outcomes land above and half below. It is not a forecast of 24 or 25.

## First questions

1. How many games are in the sample?
2. How variable is the player game to game?
3. Did minutes change recently?
4. Who is the opponent and how fast do they play?
5. Is the player healthy and in the same role?

## Over and under rates

"7 of 10 over" describes the past. With ten games, the honest uncertainty band around 70% stretches from roughly 40% to 90%. EDGEWISE shows that interval so small samples cannot masquerade as certainty.`,
        quiz: [
          { q: "A 24.5 line most closely represents…", options: ["A guarantee of 25", "A median expectation", "A season high", "A minimum"], answer: 1, why: "Lines are set near the median of expected outcomes." },
          { q: "Which factor most directly scales per-game production?", options: ["Jersey number", "Minutes played", "Venue capacity", "Day of week"], answer: 1, why: "More minutes means more opportunities." },
          { q: "'Over in 7 of 10 games' is best described as…", options: ["A 70% probability", "A past hit rate with wide uncertainty", "A certainty", "Irrelevant"], answer: 1, why: "Small samples have wide confidence intervals." },
        ],
      },
      {
        slug: "what-are-odds",
        title: "What are odds?",
        minutes: 5,
        summary: "American, decimal, and fractional formats and how to convert between them.",
        body: `## Three formats, one idea

- **American**: −150 means risk 150 to win 100; +200 means risk 100 to win 200.
- **Decimal**: total return per $1 staked, e.g. 2.50 returns $2.50 including the stake.
- **Fractional**: profit/stake, e.g. 3/2 means win $3 for every $2 staked.

## Conversions

- Decimal from American: positive odds → odds/100 + 1; negative → 100/|odds| + 1.
- Probability from decimal: 1 / decimal.

Use the [odds converter](/tools/odds-converter) to check your work.`,
        quiz: [
          { q: "Decimal odds of 2.00 equal American odds of…", options: ["−200", "+100", "+200", "−100"], answer: 1, why: "2.00 means even money: +100." },
          { q: "Fractional 3/1 implies a probability of…", options: ["75%", "33%", "25%", "50%"], answer: 2, why: "1 / (3 + 1) = 25%." },
          { q: "American −150 as decimal is…", options: ["1.50", "1.67", "2.50", "0.67"], answer: 1, why: "100/150 + 1 = 1.667." },
        ],
      },
      {
        slug: "basic-statistics",
        title: "Basic statistical concepts",
        minutes: 8,
        summary: "Mean, median, standard deviation, and why the shape of the distribution matters.",
        interactive: "variance",
        body: `## Mean vs median

The **mean** is the average; the **median** is the middle value. When a player has one 50-point game in a season of 20s, the mean rises but the median barely moves. Lines are set closer to medians for that reason.

## Standard deviation

Standard deviation (σ) measures spread. Two players can both average 24 points; one with σ=4 is consistent, one with σ=9 is volatile. For a line near the average, the volatile player's single game is nearly a coin flip.

## Distributions

Counts like goals or three-pointers follow skewed, discrete distributions. Points or yards look more bell-shaped. The shape tells you which simple model is reasonable.

Explore how spread changes outcomes in the interactive below.`,
        quiz: [
          { q: "Which is least affected by one extreme game?", options: ["Mean", "Median", "Total", "Maximum"], answer: 1, why: "The median is robust to outliers." },
          { q: "A higher standard deviation means…", options: ["More consistent outcomes", "More spread-out outcomes", "Higher average", "Smaller sample"], answer: 1, why: "σ measures dispersion." },
          { q: "Goals scored per match are best modeled as…", options: ["A continuous bell curve", "A discrete count distribution", "A straight line", "A constant"], answer: 1, why: "Counts are discrete and skewed." },
        ],
      },
    ],
  },
  // ───────────── INTERMEDIATE ─────────────
  {
    slug: "analyst-toolkit",
    level: "intermediate",
    title: "The Analyst's Toolkit",
    description: "Expected value, variance, distributions, sample sizes, liquidity, bias and risk management.",
    lessons: [
      {
        slug: "expected-value",
        title: "Expected value",
        minutes: 9,
        summary: "The probability-weighted average outcome and how fees change it.",
        interactive: "expected-value",
        body: `## The formula

For a $1 contract bought at price **P** with your probability **q**:

> EV = q × $1 − P − fees

At 40¢ with q = 50%: EV = 0.50 − 0.40 = **+10¢** before fees.

## Fees eat small edges

Kalshi's taker fee is roughly 0.07 × P × (1 − P) per contract. At 50¢ that is about 2¢. A "2-point edge" becomes zero.

## The break-even probability

Rearranging: the estimate at which EV is zero is **q* = P + fees**. If your confidence interval for q includes q*, you have not found an edge; you have found uncertainty.

Use the interactive calculator to see how EV moves with price, probability and fees.`,
        quiz: [
          { q: "Price 30¢, your probability 45%, fees 1¢. EV per contract is…", options: ["+14¢", "+15¢", "−16¢", "+45¢"], answer: 0, why: "0.45 − 0.30 − 0.01 = 0.14." },
          { q: "The break-even probability for a 60¢ contract with 2¢ fees is…", options: ["58%", "60%", "62%", "64%"], answer: 2, why: "q* = P + fees = 0.62." },
          { q: "A +EV decision that loses was…", options: ["A bad decision", "A good decision with a bad outcome", "Impossible", "A sign the model is broken"], answer: 1, why: "EV separates decision quality from outcome luck." },
        ],
      },
      {
        slug: "variance-and-risk",
        title: "Variance",
        minutes: 8,
        summary: "Why high-EV, high-variance choices can still ruin you, and how to think about it.",
        interactive: "variance",
        body: `## Variance is the price of EV

Even a genuinely +EV repeated decision produces long losing streaks. With a 55% hit rate on even-money propositions, a run of five straight losses happens about 1.8% of the time per sequence, and in 100 trials it is almost certain to occur somewhere.

## Standard error

The uncertainty in an observed hit rate shrinks with the square root of the sample size. Quadrupling your sample halves the error band.

## Drawdowns

Expect them. Plan stakes so that a plausible losing streak does not force you out. The Advanced course covers Kelly sizing and Monte Carlo simulation, which make this concrete.`,
        quiz: [
          { q: "To halve the uncertainty of an observed rate you need…", options: ["Twice the sample", "Four times the sample", "Ten times the sample", "The same sample"], answer: 1, why: "Standard error scales with 1/√n." },
          { q: "A long losing streak with a +EV approach is…", options: ["Proof the edge is gone", "Expected under variance", "Impossible", "A rounding issue"], answer: 1, why: "Streaks are normal in random sequences." },
          { q: "Variance mostly affects…", options: ["Long-run average", "Short-run path", "Fees", "Resolution rules"], answer: 1, why: "Variance determines the path, EV the destination." },
        ],
      },
      {
        slug: "probability-distributions",
        title: "Probability distributions",
        minutes: 9,
        summary: "Normal, Poisson and empirical distributions, and converting a line into a probability.",
        body: `## Choose a shape

- **Normal**: continuous, symmetric. Reasonable for points, yards, minutes.
- **Poisson**: counts of rare events. Reasonable for goals, three-pointers, strikeouts (roughly).
- **Empirical**: the actual histogram of past games. Honest but noisy with small samples.

## From distribution to probability

If a player's points look normal with mean 24 and σ 6, the probability of exceeding 26.5 is P(Z > (26.5 − 24)/6) = P(Z > 0.42) ≈ **34%**.

EDGEWISE blends a parametric estimate with the empirical hit rate (shrunk toward the parametric value) and shows both, so you can see when they disagree.`,
        quiz: [
          { q: "Goals per match are best approximated by…", options: ["Normal", "Poisson", "Uniform", "Exponential"], answer: 1, why: "Low counts of discrete events." },
          { q: "Mean 24, σ 6: P(points > 30) is roughly…", options: ["50%", "34%", "16%", "2%"], answer: 2, why: "One standard deviation above the mean leaves ~16% in the tail." },
          { q: "The empirical distribution is…", options: ["Always best", "Honest but noisy in small samples", "Never useful", "The same as normal"], answer: 1, why: "It reflects actual outcomes but has high sampling error." },
        ],
      },
      {
        slug: "sample-sizes",
        title: "Historical sample sizes",
        minutes: 7,
        summary: "Confidence intervals for hit rates and why 'last 5 games' is weak evidence.",
        interactive: "sample-size",
        body: `## Wilson intervals

For 7 hits in 10 games, a 95% interval runs from about **40% to 89%**. For 70 in 100, it is **60% to 78%**. The point estimate is identical; the evidence is not.

## Recency bias

Last-5 splits feel informative because they are vivid. Statistically, they are among the weakest inputs you have. Weight them, do not anchor on them.

## Shrinkage

A practical fix is to shrink small-sample rates toward a prior (often the season rate or 50%) with a pseudo-count of several games. EDGEWISE uses a pseudo-count of 6 in its projection analysis and shows the result next to the raw rate.`,
        quiz: [
          { q: "7 of 10 vs 70 of 100: which has the narrower interval?", options: ["7 of 10", "70 of 100", "Same", "Neither"], answer: 1, why: "Larger samples give narrower intervals." },
          { q: "Shrinkage moves a small-sample rate toward…", options: ["Zero", "A prior such as the season rate", "100%", "The line"], answer: 1, why: "Shrinkage regularizes toward a sensible baseline." },
          { q: "Last-5-game splits are…", options: ["Strong evidence", "Weak, high-variance evidence", "Useless", "Always misleading"], answer: 1, why: "They carry some information but with wide uncertainty." },
        ],
      },
      {
        slug: "market-liquidity",
        title: "Market liquidity",
        minutes: 6,
        summary: "Spreads, depth, volume and why thin markets mislead.",
        body: `## Three signals

- **Spread**: 1¢ means consensus; 10¢ means the market cannot agree.
- **Depth**: how many contracts sit at the best bid and ask.
- **Volume**: how much has traded, especially in the last 24 hours.

## Thin markets

With little volume, a single order moves the price several points. The "implied probability" then reflects one participant. EDGEWISE lowers model confidence automatically when 24h volume is low or the spread is wide, and the Opportunity Scanner excludes low-confidence situations by default.`,
        quiz: [
          { q: "A 10¢ spread suggests…", options: ["Strong consensus", "Low liquidity or disagreement", "A fee", "An error"], answer: 1, why: "Wide spreads signal illiquidity or uncertainty." },
          { q: "In a thin market, the last price mostly reflects…", options: ["Deep consensus", "The last participant", "The settlement source", "The fee schedule"], answer: 1, why: "Few trades mean individual orders dominate." },
          { q: "Which lowers EDGEWISE's model confidence?", options: ["High volume", "Narrow spread", "Low 24h volume", "Long history"], answer: 2, why: "Low volume reduces confidence." },
        ],
      },
      {
        slug: "statistical-bias",
        title: "Statistical bias",
        minutes: 8,
        summary: "Favorite–longshot bias, survivorship, selection, and correlation vs causation.",
        body: `## Favorite–longshot bias

Across many markets, low-probability contracts trade slightly above their realized frequency and high-probability contracts slightly below. The effect is small but persistent, and it is the basis of EDGEWISE's mild calibration adjustment (shown transparently on each market page).

## Selection and survivorship

Studying only the markets you remember, or the players who stayed healthy, biases results upward.

## Correlation vs causation

A player scoring more on Tuesdays is almost certainly noise. Demand a mechanism (minutes, matchup, role) before believing a split.`,
        quiz: [
          { q: "Favorite–longshot bias means low-probability contracts tend to be…", options: ["Underpriced", "Slightly overpriced", "Perfectly priced", "Untradeable"], answer: 1, why: "Longshots are historically a bit rich." },
          { q: "Studying only remembered markets introduces…", options: ["Selection bias", "No bias", "Variance", "Liquidity"], answer: 0, why: "Memory-based samples are selected, not random." },
          { q: "A split without a mechanism is probably…", options: ["Causal", "Noise", "A rule change", "A fee effect"], answer: 1, why: "Require a plausible cause." },
        ],
      },
      {
        slug: "risk-management",
        title: "Risk management",
        minutes: 8,
        summary: "Bankroll thinking, correlation, position limits and the role of uncertainty bands.",
        body: `## Think in bankroll fractions

Whether you ever trade or not, the mental model matters: how much of a budget would a decision risk, and what happens in the bad tail?

## Correlation is hidden leverage

Ten positions on outcomes driven by the same factor behave like one large position.

## Use the low end

Make decisions on the **lower bound** of your probability interval, not the point estimate. If the decision is still acceptable at the low end, uncertainty is not your enemy.

## Stop rules

Decide in advance what evidence would change your mind. Write it down. EDGEWISE's Performance Tracker exists to make that evidence visible over time.`,
        quiz: [
          { q: "Correlated positions act like…", options: ["Diversification", "One larger position", "Zero risk", "Fees"], answer: 1, why: "Correlation concentrates risk." },
          { q: "Decisions should be stress-tested at…", options: ["The point estimate", "The lower bound of the interval", "The upper bound", "The market price only"], answer: 1, why: "Plan for the pessimistic end." },
          { q: "Why pre-commit to stop rules?", options: ["To avoid rationalizing after the fact", "To increase variance", "To ignore evidence", "To speed up trading"], answer: 0, why: "Pre-commitment limits motivated reasoning." },
        ],
      },
    ],
  },
  // ───────────── ADVANCED ─────────────
  {
    slug: "quantitative-forecasting",
    level: "advanced",
    title: "Quantitative Forecasting",
    description: "Bayesian updating, regression, calibration, Monte Carlo simulation, market efficiency and portfolio risk.",
    lessons: [
      {
        slug: "bayesian-reasoning",
        title: "Bayesian reasoning",
        minutes: 10,
        summary: "Updating a prior with evidence, with a worked example on a market move.",
        interactive: "bayes",
        body: `## Priors and likelihoods

Start with a prior probability. When evidence arrives, multiply by how much more likely that evidence is if the event is true than if it is false (the likelihood ratio), then renormalize.

In odds form: **posterior odds = prior odds × likelihood ratio**.

## Example

Prior 40% (odds 2:3). A data release arrives that is 3× more likely under YES than NO. Posterior odds = (2/3) × 3 = 2:1 → **67%**.

## Markets as Bayesian agents

A market price jump after news is the crowd's update. Comparing the size of the jump to your own likelihood ratio tells you whether you and the market weigh the evidence similarly.`,
        quiz: [
          { q: "Prior 50%, likelihood ratio 4. Posterior is…", options: ["60%", "67%", "80%", "90%"], answer: 2, why: "Odds 1:1 × 4 = 4:1 → 80%." },
          { q: "A likelihood ratio of 1 means the evidence…", options: ["Confirms YES", "Is uninformative", "Confirms NO", "Doubles the odds"], answer: 1, why: "LR of 1 leaves odds unchanged." },
          { q: "Posterior odds equal…", options: ["Prior odds + LR", "Prior odds × LR", "LR / prior odds", "Prior probability × LR"], answer: 1, why: "Bayes' rule in odds form." },
        ],
      },
      {
        slug: "regression-analysis",
        title: "Regression analysis",
        minutes: 10,
        summary: "Using regression to explain production with minutes, pace and opponent, and its traps.",
        body: `## The idea

Regress a stat (points) on explanatory variables (minutes, opponent defensive rating, pace, home/away). The coefficients tell you how much each factor moves the expectation; the residual spread tells you how much is unexplained.

## Traps

- **Overfitting**: with 20 games and 6 variables you will fit noise.
- **Leakage**: using information that was not available before the game.
- **Multicollinearity**: pace and minutes are correlated; coefficients become unstable.

## Regression to the mean

Separately from the technique, remember the phenomenon: extreme recent performance tends to move back toward the long-run average. Most hot streaks are partly luck.`,
        quiz: [
          { q: "Fitting 6 variables to 20 games mainly risks…", options: ["Underfitting", "Overfitting", "Leakage", "Bias"], answer: 1, why: "Too many parameters for the data." },
          { q: "Using post-game information in a model is called…", options: ["Shrinkage", "Leakage", "Pace adjustment", "Calibration"], answer: 1, why: "Leakage inflates apparent accuracy." },
          { q: "Regression to the mean predicts that hot streaks…", options: ["Continue", "Tend to fade toward the average", "Become permanent", "Are causal"], answer: 1, why: "Extremes partially revert." },
        ],
      },
      {
        slug: "model-calibration",
        title: "Model calibration",
        minutes: 9,
        summary: "Brier score, log loss, calibration curves and skill scores against the market.",
        interactive: "calibration",
        body: `## Scoring rules

- **Brier**: mean squared error of probabilities (0.25 = always 50%).
- **Log loss**: punishes confident errors harshly.

Both are *proper*: you minimize them by reporting your true belief.

## Calibration curves

Bucket forecasts and plot observed frequency. Flat curves mean overconfidence.

## Skill vs the market

Compute your Brier score and the market's Brier score on the same events. Skill = 1 − yours/market's. Positive skill, sustained over a large sample, is the only convincing evidence of edge. EDGEWISE's Performance Tracker computes this once you have resolved predictions.`,
        quiz: [
          { q: "A Brier score of 0.25 corresponds to…", options: ["Perfect forecasts", "Always forecasting 50%", "Always wrong", "Random guessing of 0 or 1"], answer: 1, why: "Constant 50% gives 0.25." },
          { q: "Which metric punishes a confident wrong forecast most?", options: ["Accuracy", "Brier", "Log loss", "Hit rate"], answer: 2, why: "Log loss is unbounded as p → 0 for a YES outcome." },
          { q: "A positive skill score vs the market means…", options: ["You matched the market", "You beat the market's Brier score", "You lost to the market", "Nothing"], answer: 1, why: "Skill = 1 − Brier/BrierRef > 0 means lower error." },
        ],
      },
      {
        slug: "ev-in-depth",
        title: "Expected value calculations in depth",
        minutes: 9,
        summary: "Fees, spread, slippage, correlated legs and EV under uncertainty.",
        interactive: "expected-value",
        body: `## Realistic EV

> EV = q − (ask price) − fee − expected slippage

Use the **ask**, not the mid, because that is what a buyer pays. Add slippage when size exceeds the displayed depth.

## EV under uncertainty

If q is itself uncertain with interval [q_lo, q_hi], report EV at q_lo. An "edge" that disappears at the low end is not robust.

## Correlated legs

Combining propositions that depend on the same factor does not multiply independent probabilities. The joint probability must account for correlation, which usually makes combinations less attractive than they look.`,
        quiz: [
          { q: "A buyer should compute EV using the…", options: ["Bid", "Mid", "Ask", "Last trade"], answer: 2, why: "Buyers pay the ask." },
          { q: "Reporting EV at the low end of q is an example of…", options: ["Optimism", "Robustness testing", "Leakage", "Overfitting"], answer: 1, why: "Stress-testing the estimate." },
          { q: "Correlated legs typically make a combination…", options: ["More attractive", "Less attractive than independence implies", "Risk-free", "Unchanged"], answer: 1, why: "Correlation raises joint variance and often lowers joint probability relative to naive products." },
        ],
      },
      {
        slug: "monte-carlo",
        title: "Monte Carlo simulations",
        minutes: 10,
        summary: "Simulating thousands of seasons to see the real distribution of outcomes and drawdowns.",
        interactive: "monte-carlo",
        body: `## Why simulate

Closed-form math gets hard with correlation, variable stakes and path dependence. Simulation is simple: draw random outcomes thousands of times and look at the distribution.

## Procedure

1. Define each decision's probability and payoff.
2. Draw outcomes with a random number generator.
3. Track the bankroll path.
4. Repeat 10,000 times. Report the median, the 5th percentile, and the max drawdown distribution.

## What you learn

Even with positive EV, a meaningful fraction of paths show deep drawdowns. The interactive below lets you change the hit rate and stake fraction and watch the risk of ruin respond.`,
        quiz: [
          { q: "Monte Carlo is most useful when…", options: ["Math is trivial", "Correlation and path dependence make closed forms hard", "There is no randomness", "You want one answer"], answer: 1, why: "Simulation handles complexity closed forms struggle with." },
          { q: "Which output best captures downside risk?", options: ["Mean", "Median", "5th percentile and max drawdown", "Mode"], answer: 2, why: "Tail metrics describe bad paths." },
          { q: "Positive EV guarantees…", options: ["No drawdowns", "Profit in every path", "Nothing about individual paths", "Zero variance"], answer: 2, why: "EV is a long-run average, not a path guarantee." },
        ],
      },
      {
        slug: "market-efficiency",
        title: "Market efficiency",
        minutes: 8,
        summary: "When markets are hard to beat, where inefficiencies hide, and how to test a claimed edge.",
        body: `## The default assumption

Liquid markets with many informed participants are efficient enough that most apparent edges are noise or cost. Treat "the market is wrong" as an extraordinary claim.

## Where inefficiency lives

- Thin, new or obscure markets.
- Moments right after news, before prices adjust.
- Structural biases (favorite–longshot) that are too small to arbitrage after fees.

## Testing a claimed edge

Record forecasts in advance, lock them, resolve them, compute skill against the market. Require a sample large enough that the skill score's confidence interval excludes zero. Anything less is storytelling.`,
        quiz: [
          { q: "In a liquid market, an apparent 2-point edge is most likely…", options: ["Real", "Noise or cost", "A guaranteed profit", "A rule error"], answer: 1, why: "Efficient markets leave little after fees." },
          { q: "Where are inefficiencies more plausible?", options: ["Thin or new markets", "The most liquid markets", "After resolution", "Nowhere"], answer: 0, why: "Fewer informed participants." },
          { q: "The convincing test of an edge is…", options: ["A good story", "Locked forecasts with positive skill over a large sample", "One big win", "Backtests only"], answer: 1, why: "Prospective, scored forecasts." },
        ],
      },
      {
        slug: "portfolio-risk",
        title: "Portfolio risk concepts",
        minutes: 9,
        summary: "Kelly sizing, fractional Kelly, correlation and diversification across markets.",
        interactive: "kelly",
        body: `## Kelly criterion

For a binary proposition with decimal odds **b+1** and probability **q**, the Kelly fraction is **(q·b − (1 − q)) / b**. It maximizes long-run growth but with brutal variance.

## Fractional Kelly

Practitioners use a quarter to a half of Kelly because the probability input is uncertain. Overestimating q by a few points can turn full Kelly into a losing strategy.

## Diversification

Independent positions reduce variance; correlated ones do not. Group positions by their driving factor and size the group, not each leg.

## For analysts, not just traders

Even if you never place a position, Kelly reasoning clarifies how much any single belief should matter.`,
        quiz: [
          { q: "q = 55%, even money (b = 1). Kelly fraction is…", options: ["5%", "10%", "20%", "55%"], answer: 1, why: "(0.55 − 0.45)/1 = 0.10." },
          { q: "Why use fractional Kelly?", options: ["Fees are zero", "Probability estimates are uncertain", "It increases growth", "Regulators require it"], answer: 1, why: "Uncertainty in q makes full Kelly dangerous." },
          { q: "Correlated positions should be sized…", options: ["Independently", "As a group by driving factor", "At full Kelly each", "Not at all"], answer: 1, why: "Correlation means they move together." },
        ],
      },
    ],
  },
];

export const LEVELS: Array<{ key: Level; label: string; blurb: string }> = [
  { key: "beginner", label: "Beginner", blurb: "No prior knowledge required." },
  { key: "intermediate", label: "Intermediate", blurb: "The working analyst's toolkit." },
  { key: "advanced", label: "Advanced", blurb: "Quantitative forecasting and risk." },
];

export function getCourse(slug: string) {
  return COURSES.find((c) => c.slug === slug) ?? null;
}
export function getLesson(courseSlug: string, lessonSlug: string) {
  const course = getCourse(courseSlug);
  const lesson = course?.lessons.find((l) => l.slug === lessonSlug) ?? null;
  return course && lesson ? { course, lesson } : null;
}
export function totalLessons() {
  return COURSES.reduce((a, c) => a + c.lessons.length, 0);
}

export const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  first_lesson: { title: "First Lesson", description: "Completed your first Academy lesson." },
  beginner_complete: { title: "Fundamentals", description: "Completed every Beginner lesson." },
  intermediate_complete: { title: "Analyst", description: "Completed every Intermediate lesson." },
  advanced_complete: { title: "Quant", description: "Completed every Advanced lesson." },
  perfect_quiz: { title: "Perfect Score", description: "Scored 100% on a quiz." },
  streak_7: { title: "Seven-Day Streak", description: "Learned on seven consecutive days." },
  first_prediction: { title: "On the Record", description: "Logged your first locked prediction." },
  ten_resolved: { title: "Scored", description: "Ten predictions resolved; Brier score unlocked." },
  first_report: { title: "Researcher", description: "Generated your first research report." },
};
