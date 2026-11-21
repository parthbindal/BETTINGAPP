"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Follow a research topic or a statistical category (free text). */
export function AddTopicForm() {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"topic" | "stat">("topic");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, refId: label.trim(), label: label.trim() }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add");
      setLabel("");
      toast.success("Added to watchlist");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
      <select value={kind} onChange={(e) => setKind(e.target.value as "topic" | "stat")} aria-label="Type" className="h-8 rounded-lg border border-input bg-surface-2/40 px-2.5 text-sm">
        <option value="topic">Research topic</option>
        <option value="stat">Statistical category</option>
      </select>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={kind === "topic" ? "e.g. Fed rate decisions" : "e.g. Three-pointers made"} className="flex-1" />
      <Button type="submit" size="sm" disabled={busy || !label.trim()}>
        <Plus className="size-4" /> Follow
      </Button>
    </form>
  );
}
