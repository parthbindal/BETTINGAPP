"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const selectClass = "h-7 rounded-lg border border-input bg-surface-2/40 px-2 text-xs";

async function call(href: string, method: string, body: unknown): Promise<string> {
  const res = await fetch(href, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data.message ?? "Done";
}

export function UserActions({ userId, isSelf, role, banned, hasGrant }: { userId: string; isSelf: boolean; role: string; banned: boolean; hasGrant: boolean }) {
  const [action, setAction] = useState("grant-pro");
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function apply() {
    const body =
      action === "grant-pro"
        ? { action: "grant", userId, tier: "pro", months }
        : action === "revoke"
          ? { action: "revoke", userId }
          : action === "make-admin"
            ? { action: "setRole", userId, role: "admin" }
            : action === "remove-admin"
              ? { action: "setRole", userId, role: "user" }
              : action === "ban"
                ? { action: "ban", userId }
                : { action: "unban", userId };
    if ((action === "ban" || action === "remove-admin") && !window.confirm("Apply this change?")) return;
    setBusy(true);
    try {
      toast.success(await call("/api/admin/users", "PATCH", body));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass} aria-label="Action">
        <option value="grant-pro">Grant Pro (complimentary)</option>
        {hasGrant && <option value="revoke">Revoke grant</option>}
        {role === "admin" ? !isSelf && <option value="remove-admin">Remove admin</option> : <option value="make-admin">Make admin</option>}
        {!isSelf && (banned ? <option value="unban">Unban</option> : <option value="ban">Ban</option>)}
      </select>
      {action.startsWith("grant") && (
        <input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(36, Number(e.target.value) || 1)))} className={`${selectClass} w-14`} aria-label="Months" title="Months" />
      )}
      <Button size="xs" variant="outline" onClick={apply} disabled={busy}>
        Apply
      </Button>
    </div>
  );
}

export function LimitEditor({ keys }: { keys: Array<{ key: string; type: "number" | "boolean" }> }) {
  const [tier, setTier] = useState("free");
  const [key, setKey] = useState(keys[0]?.key ?? "");
  const [num, setNum] = useState("10");
  const [bool, setBool] = useState(true);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const type = keys.find((k) => k.key === key)?.type ?? "number";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success(await call("/api/admin/limits", "POST", { tier, key, value: type === "number" ? Number(num) : bool }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-muted-foreground">
        Plan
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={`${selectClass} mt-1 block h-8`}>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Limit
        <select value={key} onChange={(e) => setKey(e.target.value)} className={`${selectClass} mt-1 block h-8`}>
          {keys.map((k) => (
            <option key={k.key} value={k.key}>
              {k.key}
            </option>
          ))}
        </select>
      </label>
      {type === "number" ? (
        <label className="text-xs text-muted-foreground">
          Value
          <Input type="number" min={0} value={num} onChange={(e) => setNum(e.target.value)} className="mt-1 w-28" />
        </label>
      ) : (
        <label className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={bool} onChange={(e) => setBool(e.target.checked)} className="accent-primary" /> Enabled
        </label>
      )}
      <Button type="submit" size="sm" disabled={busy || !key}>
        Save override
      </Button>
    </form>
  );
}

export function UpdateForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success(await call("/api/admin/updates", "POST", { title, body }));
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-2">
      <Input placeholder="Title" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Update title" />
      <Textarea placeholder="What changed, in one or two sentences" required minLength={5} maxLength={400} rows={3} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Update text" />
      <Button type="submit" size="sm" disabled={busy}>
        Publish update
      </Button>
    </form>
  );
}
