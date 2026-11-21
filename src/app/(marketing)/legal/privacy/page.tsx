import { Markdown } from "@/components/shared/markdown";
export const metadata = { title: "Privacy Policy" };
const BODY = `## Privacy Policy

_Last updated: November 2026. Template for counsel review._

### What we collect
Account details (name, email, date of birth for age verification, region), usage data (features used, predictions you log, learning progress), AI conversation content you submit, and billing status from our payment processor (we never store card numbers).

### How we use it
To operate the service, enforce age and jurisdiction rules, personalize recommendations, measure performance, send onboarding and account emails you can opt out of, and improve the product.

### AI processing
Questions you ask the AI Analyst and the retrieved data needed to answer them are sent to our AI provider (Anthropic) to generate a response. We store conversations in your account so you can revisit them; you can delete them.

### Sharing
Service providers only: hosting, database, payments (Stripe), email delivery, AI inference and market data providers. We do not sell personal data.

### Retention and deletion
You can delete your account from Settings, which removes personal data except records we must keep for legal or billing reasons.

### Contact
privacy@edgewise.example`;
export default function Page() {
  return <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6"><Markdown className="text-[15px]">{BODY}</Markdown></div>;
}
