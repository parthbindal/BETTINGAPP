import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, Percent, Repeat, Scale, History } from "lucide-react";

export const metadata: Metadata = { title: "Free tools", description: "Implied probability, expected value, odds converter, probability comparison and performance calculators." };

export const TOOLS = [
  { slug: "implied-probability", title: "Implied probability calculator", body: "Turn odds or a contract price into a probability and back.", icon: Percent },
  { slug: "expected-value", title: "Expected value calculator", body: "EV of a contract or wager, with fees and break-even probability.", icon: Calculator },
  { slug: "odds-converter", title: "Odds converter & vig remover", body: "American, decimal, fractional, and fair probabilities net of margin.", icon: Repeat },
  { slug: "probability-comparison", title: "Probability comparison", body: "Does a gap between market and estimate survive spread, fees and your uncertainty?", icon: Scale },
  { slug: "historical-performance", title: "Historical performance calculator", body: "Brier score, log loss and accuracy intervals for your past predictions.", icon: History },
];

export default function ToolsIndex() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Free tools</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">No account needed. Every tool runs in your browser and explains what the number means.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.slug} href={`/tools/${t.slug}`} className="card-surface group p-5 transition-colors hover:border-primary/40">
            <t.icon className="size-5 text-primary" />
            <div className="mt-3 text-base font-semibold group-hover:text-primary">{t.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
