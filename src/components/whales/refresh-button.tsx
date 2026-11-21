"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Triggers a full, accurate re-scan of the top traders' live positions (~60-90s). */
export function WhaleRefreshButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function refresh() {
    setBusy(true);
    const t = toast.loading("Rescanning the top 1,000 traders' live positions… about a minute.");
    try {
      const res = await fetch("/api/whales/refresh", { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      toast.success(data.message ?? "Refreshed", { id: t });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed", { id: t });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
      <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} /> {busy ? "Refreshing…" : "Refresh now"}
    </Button>
  );
}
