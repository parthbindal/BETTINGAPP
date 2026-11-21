import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ARTICLES, getArticle } from "@/content/articles";
import { Markdown } from "@/components/shared/markdown";
import { LinkButton } from "@/components/ui/link-button";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return a ? { title: a.title, description: a.excerpt } : {};
}

/** Reads `params` inside the boundary: known articles prerender, unknown slugs resolve at request time. */
async function ArticleBody({ params }: { params: Params }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  return (
    <>
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{a.category}</div>
      <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-3 text-base text-muted-foreground">{a.excerpt}</p>
      <div className="mt-8">
        <Markdown className="text-[15px]">{a.body}</Markdown>
      </div>
    </>
  );
}

function ArticleSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-3/4 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-4 w-full animate-pulse rounded bg-surface-2/70" />
      <div className="h-64 animate-pulse rounded-xl bg-surface-2/50" />
    </div>
  );
}

export default function ArticlePage({ params }: { params: Params }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <Suspense fallback={<ArticleSkeleton />}>
        <ArticleBody params={params} />
      </Suspense>
      <div className="card-surface mt-10 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Go deeper in the Academy</div>
          <p className="text-xs text-muted-foreground">Structured lessons, interactive examples and quizzes, free to start.</p>
        </div>
        <LinkButton href="/sign-up">Create a free account</LinkButton>
      </div>
    </article>
  );
}
