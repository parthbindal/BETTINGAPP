"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const KINDS = [
  { v: "market", l: "Prediction markets" },
  { v: "sports", l: "Sports analytics" },
  { v: "learning", l: "Learning & methods" },
  { v: "general", l: "General" },
];

export function NewThreadDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", kind: "market" });
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/community/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not post");
      setOpen(false);
      router.push(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <MessageSquarePlus className="size-4" /> Start a discussion
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a discussion</DialogTitle>
          <DialogDescription>Share analysis, a question or a method. Show your reasoning and your uncertainty. No guaranteed-win claims and no selling picks.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kind">Topic</Label>
            <select id="kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-8 w-full rounded-lg border border-input bg-surface-2/40 px-2.5 text-sm">
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required minLength={5} maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Post</Label>
            <Textarea id="body" required minLength={10} maxLength={5000} rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Posting…" : "Post discussion"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId, body }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not reply");
      setBody("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reply");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor="reply" className="sr-only">
        Reply
      </Label>
      <Textarea id="reply" required minLength={2} maxLength={3000} rows={3} placeholder="Add to the discussion…" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" disabled={busy || body.trim().length < 2}>
        {busy ? "Posting…" : "Reply"}
      </Button>
    </form>
  );
}

export function VoteButton({ threadId, initialScore, initialVoted }: { threadId: string; initialScore: number; initialVoted: boolean }) {
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState(initialVoted);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/community/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId, value: voted ? 0 : 1 }) });
      const data = (await res.json()) as { error?: string; score?: number };
      if (!res.ok) throw new Error(data.error ?? "Could not vote");
      setScore(data.score ?? score);
      setVoted(!voted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not vote");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={busy} aria-pressed={voted}>
      <ThumbsUp className={cn("size-4", voted && "fill-primary text-primary")} /> Useful <span className="tabular text-muted-foreground">{score}</span>
    </Button>
  );
}
