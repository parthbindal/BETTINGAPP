"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { compact } from "@/lib/format";
import { FOLLOW_MIN_USD, MIN_USD_OPTIONS, RANK_OPTIONS, type AlertPrefs } from "@/lib/smart-alerts-core";
import { cn } from "@/lib/utils";

interface Props {
  pro: boolean;
  telegram: { ready: boolean; linked: { username: string | null } | null };
  channelUrl: string | null;
  initial: AlertPrefs;
  /** [usd, rank] of every burst stored in the last 24 hours, once the engine has a full day of data. */
  history: Array<[number, number | null]> | null;
}

async function call(url: string, method: string, body?: unknown): Promise<{ url?: string; message?: string }> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; url?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** A small segmented control, the same shape as the period switcher on Top Traders. */
function Segmented<T extends number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap rounded-lg border border-border bg-surface-1 p-0.5", disabled && "opacity-50")}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", o.value === value && "bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TelegramRow({ ready, linked }: Props["telegram"]) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  // While a link is out, refresh until the webhook has tied the chat to this account (two minutes at most).
  useEffect(() => {
    if (!link || linked) return;
    let n = 0;
    const t = setInterval(() => {
      n++;
      router.refresh();
      if (n >= 40) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [link, linked, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p className="rounded-lg border border-border bg-surface-1 px-3.5 py-3 text-xs text-muted-foreground">
        Telegram delivery is not switched on for this site yet. Your alerts still arrive under Notifications (the bell at the top).
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-3.5 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Send className="size-4 text-muted-foreground" aria-hidden="true" /> Telegram
          {linked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-foreground">
              <Check className="size-3" aria-hidden="true" /> Connected
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {linked ? `Alerts go to ${linked.username ? `@${linked.username}` : "your Telegram chat"}.` : link ? "Tap Start in Telegram to finish. This page updates when it is done." : "Get each alert on your phone, not just in the app."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {linked ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(async () => void toast.success((await call("/api/settings/telegram/test", "POST")).message ?? "Test sent"))}>
              Send a test
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  toast.success((await call("/api/settings/telegram", "DELETE")).message ?? "Disconnected");
                  setLink(null);
                  router.refresh();
                })
              }
            >
              Disconnect
            </Button>
          </>
        ) : link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
            Open Telegram and tap Start
          </a>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={() => run(async () => setLink((await call("/api/settings/telegram", "POST")).url ?? null))}>
            Connect Telegram
          </Button>
        )}
      </div>
    </div>
  );
}

export function SmartAlertsForm({ pro, telegram, channelUrl, initial, history }: Props) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!pro) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 text-muted-foreground" aria-hidden="true" /> Smart-money alerts are part of Pro
        </p>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
          Pro members get an alert when one of Polymarket&apos;s 1,000 most profitable traders makes a big trade{telegram.ready ? ", in the app and on Telegram" : ""}, and when a trader they follow trades.
          {channelUrl ? " On Free, the biggest moves are posted to our public Telegram channel an hour later." : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/pricing" className={buttonVariants({ size: "sm" })}>
            See Pro
          </Link>
          {channelUrl && (
            <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Join the free channel
            </a>
          )}
        </div>
      </div>
    );
  }

  const perDay = history ? history.filter(([usd, rank]) => usd >= p.smartMinUsd && rank !== null && rank <= p.smartMaxRank).length : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success((await call("/api/settings/smart-alerts", "PATCH", p)).message ?? "Saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <TelegramRow {...telegram} />
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 accent-primary" checked={p.smartAlerts} onChange={(e) => setP({ ...p, smartAlerts: e.target.checked })} />
            <span>
              <span className="block text-sm font-medium">Big trades by top traders</span>
              <span className="block text-xs text-muted-foreground">When one of Polymarket&apos;s most profitable traders buys or sells at least this much in one go.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-x-6 gap-y-3 pl-7">
            <Segmented label="Trade size" value={p.smartMinUsd} disabled={!p.smartAlerts} onChange={(v) => setP({ ...p, smartMinUsd: v })} options={MIN_USD_OPTIONS.map((v) => ({ value: v, label: `$${compact(v)}+` }))} />
            <Segmented label="Traders" value={p.smartMaxRank} disabled={!p.smartAlerts} onChange={(v) => setP({ ...p, smartMaxRank: v })} options={RANK_OPTIONS.map((r) => ({ value: r, label: r === 1000 ? "All 1,000" : `Top ${r}` }))} />
          </div>
          {p.smartAlerts && (
            <p className="tabular pl-7 text-xs text-muted-foreground">
              {perDay === null
                ? "An estimate of how many alerts these settings send appears after a day of data."
                : `In the last 24 hours these settings would have sent ${perDay} alert${perDay === 1 ? "" : "s"}.`}
            </p>
          )}
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 accent-primary" checked={p.followAlerts} onChange={(e) => setP({ ...p, followAlerts: e.target.checked })} />
          <span>
            <span className="block text-sm font-medium">Traders you follow</span>
            <span className="block text-xs text-muted-foreground">Every trade of ${compact(FOLLOW_MIN_USD)} or more by a trader you follow. Follow anyone from their page in Top Traders or Wallet Lookup.</span>
          </span>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {busy ? "Saving…" : "Save alert settings"}
        </Button>
      </form>
    </div>
  );
}
