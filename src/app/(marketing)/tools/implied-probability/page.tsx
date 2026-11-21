import type { Metadata } from "next";
import Link from "next/link";
import { ImpliedProbabilityCalculator, UpsellNote } from "@/components/tools/calculators";

export const metadata: Metadata = { title: "Implied probability calculator", description: "Convert American, decimal or fractional odds, or a contract price, into an implied probability." };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← All tools</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Implied probability calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Convert American, decimal or fractional odds, or a contract price, into an implied probability.</p>
      <div className="mt-8"><ImpliedProbabilityCalculator /></div>
      <div className="mt-8"><UpsellNote /></div>
    </div>
  );
}
