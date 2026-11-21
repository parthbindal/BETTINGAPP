"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchButton({ kind, refId, label, initial, size = "sm", meta, labels }: { kind: string; refId: string; label: string; initial: boolean; size?: "sm" | "icon-sm" | "default"; meta?: Record<string, unknown>; labels?: { on: string; off: string } }) {
  const [watched, setWatched] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(watched ? { kind, refId } : { kind, refId, label, meta }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setWatched(!watched);
      toast.success(watched ? "Removed from watchlist" : "Added to watchlist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size={size} onClick={toggle} disabled={busy} aria-pressed={watched} aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}>
      <Star className={cn("size-4", watched && "fill-status-warning text-status-warning")} />
      {size !== "icon-sm" && (watched ? (labels?.on ?? "Watching") : (labels?.off ?? "Watch"))}
    </Button>
  );
}
