import type { Metadata } from "next";
import Link from "next/link";
import { HistoricalPerformanceCalculator, UpsellNote } from "@/components/tools/calculators";

export const metadata: Metadata = { title: "Historical performance calculator", description: "Score past probability predictions with Brier score, log loss and a confidence interval on accuracy." };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← All tools</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Historical performance calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Score past probability predictions with Brier score, log loss and a confidence interval on accuracy.</p>
      <div className="mt-8"><HistoricalPerformanceCalculator /></div>
      <div className="mt-8"><UpsellNote /></div>
    </div>
  );
}
