"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportButton({ subjectKind, subjectRef, stat, line, label = "Generate report" }: { subjectKind: "market" | "player"; subjectRef: string; stat?: string; line?: number; label?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectKind, subjectRef, stat, line }) });
      const data = (await res.json()) as { id?: string; error?: string; mode?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Report failed");
      toast.success(data.mode === "rules" ? "Report built from data (rule-based mode)" : "Report generated");
      router.push(`/research/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" onClick={go} disabled={busy}>
      <FileText className="size-4" /> {busy ? "Generating…" : label}
    </Button>
  );
}
