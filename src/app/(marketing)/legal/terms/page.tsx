import { Markdown } from "@/components/shared/markdown";
export const metadata = { title: "Terms of Service" };
const BODY = `## Terms of Service

_Last updated: November 2026. This is a template for review by counsel before commercial launch._

### 1. What EDGEWISE is
EDGEWISE is an educational and analytical software service. It displays public market data, statistics and model estimates, and provides educational content and AI-generated explanations. EDGEWISE does not operate a betting exchange, accept wagers, hold customer funds, or execute trades on any venue.

### 2. Eligibility
You must be at least 18 years old (or the age of majority where you live, if higher) to create an account. You are responsible for complying with the laws of your jurisdiction, including any restrictions on prediction markets or sports wagering. We may restrict access by region.

### 3. No financial advice
Nothing on EDGEWISE is investment, financial, legal or tax advice, or a recommendation to buy or sell any contract or place any wager. Probabilities, model estimates and AI outputs are uncertain and may be wrong. Historical performance does not guarantee future results.

### 4. Data and third parties
Market data is sourced from third-party providers, including Kalshi's public API, and may be delayed, incomplete or inaccurate. Where no licensed sports data provider is connected, sports data is clearly labeled as fictional demo data. Trademarks belong to their owners; EDGEWISE is not affiliated with Kalshi, PrizePicks, DraftKings, FanDuel or Polymarket.

### 5. Subscriptions
Paid plans renew monthly until canceled. You may cancel at any time from Settings; access continues through the end of the current period. Fees are non-refundable except where required by law. Prices may change with notice.

### 6. Acceptable use
Do not misuse the service, scrape it, resell data, attempt to circumvent limits or age controls, or use outputs to harm others.

### 7. Limitation of liability
To the maximum extent permitted by law, EDGEWISE is provided "as is" and we are not liable for losses arising from reliance on the service.

### 8. Changes and contact
We may update these terms; continued use constitutes acceptance. Contact: legal@edgewise.example.`;
export default function Page() {
  return <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6"><Markdown className="text-[15px]">{BODY}</Markdown></div>;
}
