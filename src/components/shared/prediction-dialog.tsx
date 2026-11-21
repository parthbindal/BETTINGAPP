"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export type PredictionTarget = { domain: "market"; ticker: string } | { domain: "sports"; playerId: string; stat: string; line: number };

/**
 * Logs a probability forecast. The server (not this dialog) records the market
 * and model probabilities at that moment, so the reference prices cannot be
 * altered by the client.
 */
export function PredictionDialog({ target, question, sides, referenceProb, referenceLabel, disabledReason }: { target: PredictionTarget; question: string; sides: Array<{ value: string; label: string }>; referenceProb?: number | null; referenceLabel?: string; disabledReason?: string | null }) {
  const [open, setOpen] = useState(false);
  const [prob, setProb] = useState(Math.min(99, Math.max(1, Math.round((referenceProb ?? 0.5) * 100))));
  const [side, setSide] = useState(sides[0]?.value ?? "yes");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, side, predictedProb: prob / 100, notes: notes.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Prediction logged and timestamped. It locks when the event starts or the market closes.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (disabledReason) {
    return (
      <Button variant="outline" size="sm" disabled title={disabledReason}>
        <Target className="size-4" /> Log prediction
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Target className="size-4" /> Log prediction
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a prediction</DialogTitle>
          <DialogDescription>A forecast for your Performance Tracker, not a wager. It is recorded with the market and model probabilities at this moment, cannot be edited, and is scored with Brier and calibration once the outcome is known.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm font-medium">{question}</p>
          <div className="space-y-1.5">
            <Label>Side</Label>
            <div className="flex gap-2">
              {sides.map((s) => (
                <button key={s.value} type="button" onClick={() => setSide(s.value)} aria-pressed={side === s.value} className={`rounded-lg border px-3 py-1.5 text-sm ${side === s.value ? "border-primary bg-primary/10" : "border-border"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Your probability that this side is correct</Label>
              <span className="tabular text-sm font-semibold">{prob}%</span>
            </div>
            <Slider value={[prob]} min={1} max={99} step={1} onValueChange={(v) => setProb(Array.isArray(v) ? (v[0] as number) : (v as number))} />
            {referenceProb != null && (
              <p className="text-xs text-muted-foreground">
                {referenceLabel ?? "Reference"}: {(referenceProb * 100).toFixed(0)}% for {sides[0]?.label}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Reasoning (optional)</Label>
            <Input id="notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Why do you believe this?" />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? "Saving…" : "Save prediction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
