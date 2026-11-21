import Link from "next/link";
import { MessageSquare, ThumbsUp, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, Section, EmptyState } from "@/components/shared/page-header";
import { NewThreadDialog } from "@/components/community/community-forms";
import { displayName } from "@/lib/display";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS = [
  { key: "", label: "All" },
  { key: "market", label: "Prediction markets" },
  { key: "sports", label: "Sports analytics" },
  { key: "learning", label: "Learning & methods" },
  { key: "general", label: "General" },
];

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ kind?: string; sort?: string }> }) {
  const sp = await searchParams;
  await requireUser("/community");
  const kind = KINDS.some((k) => k.key === sp.kind) ? sp.kind : "";
  const sort = sp.sort === "useful" ? "useful" : "recent";
  const threads = await db.communityThread.findMany({
    where: kind ? { kind } : {},
    orderBy: sort === "useful" ? [{ score: "desc" }, { updatedAt: "desc" }] : [{ updatedAt: "desc" }],
    take: 50,
    include: { user: { select: { name: true } }, _count: { select: { posts: true } } },
  });
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(kind ? { kind } : {}), sort, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/community?${p.toString()}`;
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Community" description="Compare reasoning with other analysts. Discussion is about methods, evidence and uncertainty." actions={<NewThreadDialog />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <Link key={k.key} href={q({ kind: k.key })} className={cn("rounded-full border px-2.5 py-1 text-xs", kind === k.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>
              {k.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 text-xs">
          <Link href={q({ sort: "recent" })} className={cn("rounded-md px-2 py-1", sort === "recent" ? "bg-surface-2 text-foreground" : "text-muted-foreground")}>
            Recent
          </Link>
          <Link href={q({ sort: "useful" })} className={cn("rounded-md px-2 py-1", sort === "useful" ? "bg-surface-2 text-foreground" : "text-muted-foreground")}>
            Most useful
          </Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          {threads.length ? (
            <ul className="card-surface divide-y divide-border/60">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/community/${t.id}`} className="block px-4 py-3 hover:bg-surface-2/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{t.title}</div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
                        <div className="mt-1.5 text-[11px] capitalize text-muted-foreground">
                          {t.kind} · {displayName(t.user.name)} · {relative(t.updatedAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="size-3.5" /> {t.score}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="size-3.5" /> {t._count.posts}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Users />} title="No discussions yet" description="Be the first to share an analysis or ask a question." />
          )}
        </div>
        <Section title="Community guidelines">
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>Explain your reasoning and say how confident you are.</li>
            <li>Cite data and where it came from.</li>
            <li>No guaranteed-win claims, no selling or soliciting picks.</li>
            <li>Disagree with the argument, not the person.</li>
            <li>Nothing here is financial advice.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
