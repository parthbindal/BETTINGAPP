import type { Metadata } from "next";
import Link from "next/link";
import { OddsConverter, UpsellNote } from "@/components/tools/calculators";

export const metadata: Metadata = { title: "Odds converter", description: "Convert between odds formats and remove the bookmaker margin to get fair probabilities." };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← All tools</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Odds converter</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Convert between odds formats and remove the bookmaker margin to get fair probabilities.</p>
      <div className="mt-8"><OddsConverter /></div>
      <div className="mt-8"><UpsellNote /></div>
    </div>
  );
}
