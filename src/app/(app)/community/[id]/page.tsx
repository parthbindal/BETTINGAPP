import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, Section } from "@/components/shared/page-header";
import { ReplyForm, VoteButton } from "@/components/community/community-forms";
import { ActionButton } from "@/components/shared/action-button";
import { displayName } from "@/lib/display";
import { dateTime, relative } from "@/lib/format";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/community/${id}`);
  const thread = await db.communityThread.findUnique({
    where: { id },
    include: { user: { select: { name: true } }, posts: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } }, votes: { where: { userId: session.user.id } } },
  });
  if (!thread) notFound();
  const isAdmin = session.user.role === "admin";
  const canDelete = thread.userId === session.user.id || isAdmin;
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        <Link href="/community" className="hover:text-foreground">
          Community
        </Link>{" "}
        / <span className="capitalize">{thread.kind}</span>
      </div>
      <PageHeader
        title={thread.title}
        description={`${displayName(thread.user.name)} · ${dateTime(thread.createdAt)}`}
        actions={
          <>
            <VoteButton threadId={thread.id} initialScore={thread.score} initialVoted={thread.votes.length > 0} />
            {canDelete && (
              <ActionButton href={`/api/community/threads?id=${thread.id}`} method="DELETE" variant="ghost" confirm="Delete this discussion and its replies?">
                <Trash2 className="size-4" />
                <span className="sr-only">Delete discussion</span>
              </ActionButton>
            )}
          </>
        }
      />
      <Section>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{thread.body}</p>
      </Section>
      <Section title={`${thread.posts.length} ${thread.posts.length === 1 ? "reply" : "replies"}`}>
        {thread.posts.length > 0 && (
          <ul className="mb-5 divide-y divide-border/60">
            {thread.posts.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{displayName(p.user.name)}</span> · {relative(p.createdAt)}
                  </span>
                  {(p.userId === session.user.id || isAdmin) && (
                    <ActionButton href={`/api/community/posts?id=${p.id}`} method="DELETE" variant="ghost" size="xs" confirm="Delete this reply?">
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete reply</span>
                    </ActionButton>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p>
              </li>
            ))}
          </ul>
        )}
        <ReplyForm threadId={thread.id} />
      </Section>
      <p className="text-[11px] text-muted-foreground">Posts reflect members&apos; own opinions and are not verified by EDGEWISE. Nothing here is financial advice.</p>
    </div>
  );
}
