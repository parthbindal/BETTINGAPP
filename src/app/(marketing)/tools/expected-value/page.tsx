import type { Metadata } from "next";
import Link from "next/link";
import { ExpectedValueCalculator, UpsellNote } from "@/components/tools/calculators";

export const metadata: Metadata = { title: "Expected value calculator", description: "Expected value of a prediction-market contract or a wager, with approximate fees and the break-even probability." };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← All tools</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Expected value calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Expected value of a prediction-market contract or a wager, with approximate fees and the break-even probability.</p>
      <div className="mt-8"><ExpectedValueCalculator /></div>
      <div className="mt-8"><UpsellNote /></div>
    </div>
  );
}
