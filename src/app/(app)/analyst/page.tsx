import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { countQueriesToday } from "@/lib/ai/analyst";
import { config } from "@/lib/env";
import { AnalystChat } from "@/components/analyst/chat";
import { PageHeader } from "@/components/shared/page-header";

export default async function AnalystPage({ searchParams }: { searchParams: Promise<{ c?: string; context?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/analyst");
  const ent = await getEntitlements(session.user.id);
  const [conversations, used] = await Promise.all([
    db.aiConversation.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 30 }),
    countQueriesToday(session.user.id),
  ]);
  const current = sp.c ? await db.aiConversation.findFirst({ where: { id: sp.c, userId: session.user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="AI Analyst" description="Your personal research analyst. It retrieves data, identifies the source, explains its reasoning, flags uncertainty and tells you what is missing." />
      <AnalystChat
        key={current?.id ?? "new"}
        conversationId={current?.id ?? null}
        initialMessages={(current?.messages ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content, sources: (m.sources as never) ?? undefined, mode: (m.mode as "llm" | "rules" | null) ?? undefined }))}
        conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }))}
        quota={{ used, limit: ent.limits.aiQueriesPerDay }}
        aiConfigured={config.isAiConfigured}
        modelName={config.anthropicModel}
        context={sp.context ?? null}
      />
    </div>
  );
}
