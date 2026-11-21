import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES } from "@/content/articles";

export const metadata: Metadata = { title: "Learn", description: "Plain-English guides to prediction markets, probability and sports analytics." };

export default function LearnIndex() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Learn</h1>
      <p className="mt-2 text-sm text-muted-foreground">Free, plain-English guides. For structured courses with quizzes and progress tracking, see the Academy inside the app.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ARTICLES.map((a) => (
          <Link key={a.slug} href={`/learn/${a.slug}`} className="card-surface group p-5 transition-colors hover:border-primary/40">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{a.category}</div>
            <div className="mt-2 text-base font-semibold group-hover:text-primary">{a.title}</div>
            <p className="mt-1.5 text-sm text-muted-foreground">{a.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
