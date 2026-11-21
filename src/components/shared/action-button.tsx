"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Generic POST/DELETE button for small server actions via API routes. */
export function ActionButton({ href, method = "POST", body, children, variant = "outline", size = "sm", confirm, successMessage, className, refresh = true }: { href: string; method?: "POST" | "DELETE" | "PATCH"; body?: unknown; children: React.ReactNode; variant?: "default" | "outline" | "ghost" | "destructive" | "secondary"; size?: "sm" | "xs" | "default"; confirm?: string; successMessage?: string; className?: string; refresh?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      const res = await fetch(href, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (successMessage || data.message) toast.success(successMessage ?? data.message);
      if (refresh) router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant={variant} size={size} onClick={go} disabled={busy} className={className}>
      {children}
    </Button>
  );
}
