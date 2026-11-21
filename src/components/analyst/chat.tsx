"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Wrench, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { relative } from "@/lib/format";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ tool: string; ref: string; source?: string; freshness?: string; fetchedAt?: string }>;
  mode?: "llm" | "rules";
  tools?: string[];
}

export function AnalystChat({ conversationId, initialMessages, conversations, quota, aiConfigured, modelName, context }: { conversationId: string | null; initialMessages: Msg[]; conversations: Array<{ id: string; title: string; updatedAt: string }>; quota: { used: number; limit: number }; aiConfigured: boolean; modelName: string; context?: string | null }) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState(context ? `Explain ${context.replace("market:", "market ")} to me: what it means, the current implied probability, the rules, and what could change the outcome.` : "");
  const [streaming, setStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [used, setUsed] = useState(quota.used);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    if (used >= quota.limit) {
      toast.error("You have used today's AI queries for your plan.");
      return;
    }
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setActiveTools([]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: convId, message, context }) });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      const tools: string[] = [];
      // Each update passes a value snapshot, so no state updater captures `acc` or `tools`.
      const patchLast = (patch: Partial<Msg>) => setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, ...patch } : x)));
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as { type: string; [k: string]: unknown };
          if (ev.type === "meta") {
            setConvId(ev.conversationId as string);
          } else if (ev.type === "text") {
            acc += ev.text as string;
            patchLast({ content: acc });
          } else if (ev.type === "tool_start") {
            tools.push(ev.name as string);
            setActiveTools([...tools]);
          } else if (ev.type === "error") {
            acc += `\n\n_${ev.message as string}_`;
            patchLast({ content: acc });
          } else if (ev.type === "done") {
            patchLast({ content: acc || (ev.refusal ? `_${ev.refusal as string}_` : ""), sources: ev.sources as Msg["sources"], mode: ev.mode as Msg["mode"], tools: [...tools] });
            setUsed((u) => u + 1);
          }
        }
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      setActiveTools([]);
    }
  }

  const suggestions = [
    "Explain the most active market right now and what would change the outcome.",
    "Teach me how implied probability works with a real market example.",
    "Which markets moved the most today, and why might that be?",
    "What statistics should I examine before evaluating a points projection?",
    "Compare a market's current probability with its 30-day history.",
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="card-surface hidden flex-col p-3 lg:flex">
        <Button onClick={() => { setConvId(null); setMessages([]); router.push("/analyst"); }} variant="outline" size="sm" className="mb-3 w-full"><Plus className="size-4" /> New conversation</Button>
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Recent</div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <a href={`/analyst?c=${c.id}`} className={cn("flex-1 truncate rounded-md px-2 py-1.5 text-xs hover:bg-surface-2/60", c.id === convId && "bg-surface-2")} title={c.title}>{c.title}</a>
              <button aria-label="Delete conversation" className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block" onClick={async () => { await fetch(`/api/ai/conversations/${c.id}`, { method: "DELETE" }); if (c.id === convId) { setConvId(null); setMessages([]); } router.refresh(); }}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
          {!conversations.length && <li className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</li>}
        </ul>
        <div className="mt-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between"><span>Queries today</span><span className="tabular">{used}/{quota.limit}</span></div>
          <div className="mt-1 h-1 rounded-full bg-surface-3"><div className="h-1 rounded-full bg-chart-1" style={{ width: `${Math.min(100, (used / quota.limit) * 100)}%` }} /></div>
          <div className="mt-2">{aiConfigured ? <span>Model: {modelName}</span> : <span className="text-status-warning">Rule-based mode (no AI key)</span>}</div>
        </div>
      </aside>

      <div className="card-surface flex min-h-[70vh] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <h2 className="text-lg font-semibold">Ask the analyst</h2>
              <p className="mt-1 text-sm text-muted-foreground">It retrieves live market data and your sports database, cites each source, and separates facts from estimates. It never invents numbers, and it does not place trades.</p>
              <div className="mt-6 grid gap-2 text-left">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-lg border border-border/70 bg-surface-2/30 px-3 py-2 text-left text-sm hover:border-primary/40">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[92%] rounded-2xl px-4 py-3 text-sm", m.role === "user" ? "bg-primary/15 text-foreground" : "bg-surface-2/60")}>
                {m.role === "assistant" ? (
                  <>
                    {m.content ? <Markdown>{m.content}</Markdown> : streaming && i === messages.length - 1 ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {activeTools.length ? `Retrieving: ${activeTools[activeTools.length - 1]!.replace(/_/g, " ")}` : "Thinking…"}</span> : null}
                    {i === messages.length - 1 && streaming && activeTools.length > 0 && m.content && <div className="mt-2 flex flex-wrap gap-1">{activeTools.map((t, j) => <span key={j} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"><Wrench className="size-3" />{t.replace(/_/g, " ")}</span>)}</div>}
                    {!streaming || i !== messages.length - 1 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                        {m.mode && <span className={cn("rounded-full border px-2 py-0.5", m.mode === "rules" ? "border-status-warning/40 text-status-warning" : "border-border")}>{m.mode === "rules" ? "Rule-based" : "AI"}</span>}
                        {m.sources?.slice(0, 6).map((s, j) => <span key={j} className="rounded-full border border-border px-2 py-0.5" title={s.fetchedAt ? `fetched ${relative(s.fetchedAt)}` : undefined}>{s.tool.replace(/_/g, " ")}{s.ref ? `: ${s.ref.slice(0, 28)}` : ""}{s.freshness ? ` · ${s.freshness}` : ""}</span>)}
                        {m.sources && m.sources.length > 6 && <span>+{m.sources.length - 6} more</span>}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="border-t border-border/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Ask about a market, a player projection, or a concept…" rows={2} className="min-h-[44px] flex-1 resize-none" disabled={streaming} />
            <Button type="submit" disabled={streaming || !input.trim()} aria-label="Send">{streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Educational analysis, not financial advice. The analyst only reports data it retrieved.</p>
        </form>
      </div>
    </div>
  );
}
