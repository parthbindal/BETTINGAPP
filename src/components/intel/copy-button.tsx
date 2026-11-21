"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copies a value (e.g. a wallet address) and confirms in place. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard refused (some embedded views): the address stays selectable on the page.
        }
      }}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-ring", className)}
    >
      {copied ? <Check className="size-3.5 text-brand-cyan" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}
