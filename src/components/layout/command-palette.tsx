"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitMerge, LineChart, ScrollText, Search, Wallet } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { compact } from "@/lib/format";
import { isWalletAddress, shortAddress } from "@/lib/intel";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";

type Trader = { wallet: string; name: string; rank: number; pnl: number };
type Signal = { tokenId: string; title: string; outcome: string; holders: number; totalValue: number; category: string };
type Index = { traders: Trader[]; signals: Signal[]; pro: boolean };

const PAGES = [...NAV_ITEMS.map((n) => ({ href: n.href, label: n.label, icon: n.icon })), { href: "/track-record", label: "Track record", icon: ScrollText }];

/** 2 = starts with the query, 1.5 = a word starts with it, 1 = contains it, -1 = no match. */
function score(text: string, q: string): number {
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i < 0) return -1;
  if (i === 0) return 2;
  return /[\s\-_.(]/.test(t[i - 1]!) ? 1.5 : 1;
}

const isTypingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
const subscribeNoop = () => () => {};

/**
 * ⌘K (or Ctrl+K, or "/") from anywhere: jump to any of the 1,000 tracked
 * traders, any live signal, any page, or paste a wallet address. The index is
 * fetched once, the first time the palette opens, and filtered locally, so
 * every keystroke is instant.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Index | null>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const isMac = useSyncExternalStore(subscribeNoop, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || index || failed) return;
    let cancelled = false;
    fetch("/api/search", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Index>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => !cancelled && setIndex(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, index, failed]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    const traders = index?.traders ?? [];
    const signals = index?.signals ?? [];
    if (!query) {
      return { pages: PAGES.slice(0, 7), traders: traders.slice(0, 5), signals: signals.slice(0, 4) };
    }
    const pages = PAGES.filter((p) => score(p.label, query) >= 0);
    const tr = traders
      .map((t) => ({ t, s: Math.max(score(t.name, query), t.wallet.toLowerCase().startsWith(query) ? 2 : -1) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.t.rank - b.t.rank)
      .slice(0, 7)
      .map((x) => x.t);
    const sg = signals
      .map((h) => ({ h, s: Math.max(score(h.title, query), score(h.outcome, query) - 0.5, score(h.category, query) - 0.75) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || b.h.totalValue - a.h.totalValue)
      .slice(0, 6)
      .map((x) => x.h);
    return { pages, traders: tr, signals: sg };
  }, [index, query]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const raw = q.trim();
  const wallet = isWalletAddress(raw) ? raw.toLowerCase() : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-surface-1 pr-1.5 pl-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:inline-flex"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="pr-6">Search traders, signals…</span>
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground sm:hidden">
        <Search className="size-4" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search EDGEWISE" description="Jump to a trader, a signal or a page" className="sm:max-w-xl">
        <Command shouldFilter={false} className="bg-popover">
          <CommandInput value={q} onValueChange={setQ} placeholder="Search traders, signals, pages — or paste a wallet" />
          <CommandList className="max-h-[min(60vh,28rem)]">
            {failed && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Search is unavailable right now. Pages still work below.</div>}
            <CommandEmpty>No match. Try a trader name, a market, or a 0x address.</CommandEmpty>

            {wallet && (
              <CommandGroup heading="Wallet">
                <CommandItem value={`wallet-${wallet}`} onSelect={() => go(`/wallets/${wallet}`)}>
                  <Wallet className="size-4" aria-hidden="true" /> Open wallet {shortAddress(wallet)}
                </CommandItem>
              </CommandGroup>
            )}

            {results.signals.length > 0 && (
              <CommandGroup heading={query ? "Signals" : "Biggest signals"}>
                {results.signals.map((h) => (
                  <CommandItem key={h.tokenId} value={`signal-${h.tokenId}`} onSelect={() => go(`/consensus/${h.tokenId}`)}>
                    <GitMerge className="size-4 shrink-0 text-brand-cyan" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{h.outcome}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {h.holders} · ${compact(h.totalValue)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.traders.length > 0 && (
              <CommandGroup heading={query ? "Traders" : "Top traders"}>
                {results.traders.map((t) => (
                  <CommandItem key={t.wallet} value={`trader-${t.wallet}`} onSelect={() => go(`/wallets/${t.wallet}`)}>
                    <TraderAvatar wallet={t.wallet} name={t.name} size={20} />
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      #{t.rank} · ${compact(t.pnl)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.pages.length > 0 && (
              <CommandGroup heading="Pages">
                {results.pages.map((p) => (
                  <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                    <p.icon className="size-4" aria-hidden="true" />
                    {p.label}
                    <ArrowRight className="ml-auto size-3.5 opacity-40" aria-hidden="true" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {raw.length >= 2 && !wallet && (
              <CommandGroup heading="Markets">
                <CommandItem value="markets-search" onSelect={() => go(`/markets?q=${encodeURIComponent(raw)}`)}>
                  <LineChart className="size-4" aria-hidden="true" /> Search Kalshi markets for “{raw}”
                </CommandItem>
              </CommandGroup>
            )}

            {!index && !failed && <div className={cn("px-3 py-2 text-xs text-muted-foreground")}>Loading traders and signals…</div>}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ to move · Enter to open · Esc to close</span>
            <CommandShortcut>{isMac ? "⌘K" : "Ctrl K"}</CommandShortcut>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
