"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REGIONS = ["United States", "Canada", "United Kingdom", "European Union", "Australia", "Other / prefer not to say"];
const selectClass = "h-8 w-full rounded-lg border border-input bg-surface-2/40 px-2.5 text-sm";

export function ProfileForm({ initial }: { initial: { name: string; region: string; experienceLevel: string } }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.updateUser({ name: form.name.trim(), region: form.region, experienceLevel: form.experienceLevel });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not save profile");
      return;
    }
    toast.success("Profile saved");
    router.refresh();
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="region">Region</Label>
          <select id="region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={selectClass}>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="level">Experience level</Label>
          <select id="level" value={form.experienceLevel} onChange={(e) => setForm({ ...form, experienceLevel: e.target.value })} className={selectClass}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <p className="text-[11px] text-muted-foreground">Used to tailor recommendations on your Overview.</p>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not change password");
      return;
    }
    setCurrent("");
    setNext("");
    toast.success("Password changed. Other sessions were signed out.");
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="current">Current password</Label>
          <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new">New password</Label>
          <Input id="new" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm({ hasPaidPlan }: { hasPaidPlan: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm("Delete your account and all of its data? This cannot be undone.")) return;
    setBusy(true);
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Could not delete account");
      return;
    }
    toast.success("Your account has been deleted.");
    router.push("/");
    router.refresh();
  }
  return (
    <form onSubmit={remove} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Permanently removes your profile, watchlist, predictions, reports, conversations and learning progress.{hasPaidPlan ? " Any active subscription is canceled immediately." : ""}
      </p>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="del-password">Confirm with your password</Label>
        <Input id="del-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="destructive" disabled={busy}>
        {busy ? "Deleting…" : "Delete account"}
      </Button>
    </form>
  );
}

export interface NotificationPrefs {
  marketMoves: boolean;
  moveThresholdPts: number;
  projectionUpdates: boolean;
  news: boolean;
  upcomingEvents: boolean;
  dataAvailability: boolean;
  emailDigest: string;
}

export function NotificationPrefsForm({ initial, custom, emailConfigured }: { initial: NotificationPrefs; custom: boolean; emailConfigured: boolean }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toggles: Array<{ key: keyof NotificationPrefs; label: string; hint: string }> = [
    { key: "marketMoves", label: "Market probability changes", hint: "When a watched market moves by at least your threshold." },
    { key: "upcomingEvents", label: "Upcoming events", hint: "A watched market closes, or a watched player or team plays, within 24 hours." },
    { key: "projectionUpdates", label: "Projection updates", hint: "When a line changes for a watched player (requires a live sports provider)." },
    { key: "news", label: "Relevant news", hint: "Requires a news provider; none is configured yet." },
    { key: "dataAvailability", label: "Data availability changes", hint: "When a watched item gains or loses a data source." },
  ];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/settings/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success(data.message ?? "Saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <ul className="space-y-3">
        {toggles.map((t) => (
          <li key={t.key}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 accent-primary" checked={Boolean(p[t.key])} onChange={(e) => setP({ ...p, [t.key]: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="threshold">Move threshold (probability points)</Label>
          <Input id="threshold" type="number" min={1} max={50} disabled={!custom} value={p.moveThresholdPts} onChange={(e) => setP({ ...p, moveThresholdPts: Number(e.target.value) || 5 })} />
          <p className="text-[11px] text-muted-foreground">{custom ? "Alert when a watched market moves at least this much since the last alert." : "Fixed at 5 points on the Free plan. Custom thresholds are a Pro feature."}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="digest">Email research summary</Label>
          <select id="digest" value={p.emailDigest} onChange={(e) => setP({ ...p, emailDigest: e.target.value })} className={selectClass}>
            <option value="none">Off</option>
            <option value="weekly">Weekly</option>
            <option value="daily" disabled={!custom}>
              Daily{custom ? "" : " (Pro)"}
            </option>
          </select>
          <p className="text-[11px] text-muted-foreground">{emailConfigured ? "A summary of moves and closing markets. Informational only." : "Email delivery is not configured on this deployment; summaries are available in the Research Center."}</p>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
