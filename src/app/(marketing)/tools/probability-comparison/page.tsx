import type { Metadata } from "next";
import Link from "next/link";
import { ProbabilityComparisonTool, UpsellNote } from "@/components/tools/calculators";

export const metadata: Metadata = { title: "Probability comparison tool", description: "Test whether a difference between market-implied and estimated probability survives spread, fees and your own uncertainty." };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← All tools</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Probability comparison tool</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Test whether a difference between market-implied and estimated probability survives spread, fees and your own uncertainty.</p>
      <div className="mt-8"><ProbabilityComparisonTool /></div>
      <div className="mt-8"><UpsellNote /></div>
    </div>
  );
}
