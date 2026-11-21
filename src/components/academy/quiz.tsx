"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/content/academy";

export function Quiz({ courseSlug, lessonSlug, questions }: { courseSlug: string; lessonSlug: string; questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<number[]>(Array(questions.length).fill(-1));
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean; results: Array<{ correct: boolean; answer: number; why: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit() {
    if (answers.some((a) => a < 0)) {
      toast.error("Answer every question first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/academy/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseSlug, lessonSlug, answers }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(data);
      toast[data.passed ? "success" : "info"](data.passed ? `Passed: ${data.score}/${data.total}. Lesson marked complete.` : `${data.score}/${data.total}. Review and retry to complete the lesson.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {questions.map((q, i) => (
        <div key={i}>
          <div className="text-sm font-medium">{i + 1}. {q.q}</div>
          <div className="mt-2 grid gap-1.5">
            {q.options.map((o, j) => {
              const chosen = answers[i] === j;
              const r = result?.results[i];
              const state = r ? (j === r.answer ? "correct" : chosen ? "wrong" : "") : "";
              return (
                <button key={j} type="button" disabled={Boolean(result)} onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} className={cn("rounded-lg border px-3 py-2 text-left text-sm", chosen && !result && "border-primary bg-primary/10", state === "correct" && "border-status-good bg-status-good/10", state === "wrong" && "border-status-critical bg-status-critical/10", !chosen && !state && "border-border hover:border-primary/40")}>{o}</button>
              );
            })}
          </div>
          {result && <p className="mt-1.5 text-xs text-muted-foreground">{result.results[i]!.why}</p>}
        </div>
      ))}
      {result ? (
        <div className="flex items-center justify-between rounded-lg bg-surface-2/50 px-3 py-2 text-sm"><span>Score: <span className="tabular font-semibold">{result.score}/{result.total}</span> · {result.passed ? "Passed" : "Not yet"}</span><Button size="sm" variant="outline" onClick={() => { setResult(null); setAnswers(Array(questions.length).fill(-1)); }}>Retry</Button></div>
      ) : (
        <Button onClick={submit} disabled={busy}>{busy ? "Checking…" : "Submit answers"}</Button>
      )}
    </div>
  );
}
