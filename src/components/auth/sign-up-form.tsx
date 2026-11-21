"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REGIONS = ["United States", "Canada", "United Kingdom", "European Union", "Australia", "Other / prefer not to say"];
const LEVELS = [
  { v: "beginner", l: "Beginner", d: "New to markets and statistics" },
  { v: "intermediate", l: "Intermediate", d: "Comfortable with odds and averages" },
  { v: "advanced", l: "Advanced", d: "Familiar with EV, variance and calibration" },
];
const MIN_AGE = 18;

function ageOn(dob: Date, now: Date): number {
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
  return years;
}

const subscribeToNothing = () => () => {};
function readRefParam(): string {
  return (new URLSearchParams(window.location.search).get("ref") ?? "").slice(0, 16).toUpperCase();
}

export function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", dob: "", region: REGIONS[0]!, level: "beginner" });
  const [terms, setTerms] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Referral code from ?ref=, read as an external store: the server snapshot is
  // empty and the client fills it in after hydration, so the form stays static.
  const refFromUrl = useSyncExternalStore(subscribeToNothing, readRefParam, () => "");
  const [refEdited, setRefEdited] = useState<string | null>(null);
  const refCode = refEdited ?? refFromUrl;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms || !responsible) {
      toast.error("Please accept the terms and the responsible-use acknowledgment.");
      return;
    }
    const dob = new Date(`${form.dob}T00:00:00`);
    if (!form.dob || Number.isNaN(dob.getTime())) {
      toast.error("Please enter your date of birth.");
      return;
    }
    if (ageOn(dob, new Date()) < MIN_AGE) {
      toast.error(`You must be at least ${MIN_AGE} to use EDGEWISE.`);
      return;
    }
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      dateOfBirth: dob,
      region: form.region,
      experienceLevel: form.level,
      referredById: refCode.trim() || undefined,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign up failed");
      return;
    }
    toast.success("Account created. Welcome to EDGEWISE.");
    router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-surface space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Free plan, no card required. You must be {MIN_AGE} or older.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required value={form.name} onChange={set("name")} autoComplete="name" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={10} value={form.password} onChange={set("password")} autoComplete="new-password" />
          <p className="text-[11px] text-muted-foreground">At least 10 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" required value={form.dob} onChange={set("dob")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="region">Region</Label>
          <select id="region" name="region" value={form.region} onChange={set("region")} className="h-8 w-full rounded-lg border border-input bg-surface-2/40 px-2.5 text-sm">
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Experience level</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <label key={l.v} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs ${form.level === l.v ? "border-primary bg-primary/10" : "border-border bg-surface-2/30"}`}>
              <input type="radio" name="level" value={l.v} checked={form.level === l.v} onChange={set("level")} className="sr-only" />
              <div className="font-medium">{l.l}</div>
              <div className="text-muted-foreground">{l.d}</div>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="ref">Referral code (optional)</Label>
        <Input id="ref" name="ref" value={refCode} onChange={(e) => setRefEdited(e.target.value.toUpperCase().slice(0, 16))} placeholder="ABCD1234" autoComplete="off" />
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            I accept the{" "}
            <Link href="/legal/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={responsible} onChange={(e) => setResponsible(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            I am {MIN_AGE} or older, I understand EDGEWISE is educational and does not place wagers or give financial advice, and I am responsible for the rules in my jurisdiction.{" "}
            <Link href="/legal/responsible-use" className="text-primary hover:underline">
              Responsible use
            </Link>
            .
          </span>
        </label>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
