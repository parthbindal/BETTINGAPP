import Link from "next/link";
import { cn } from "@/lib/utils";
import { shortAddress, walletHref } from "@/lib/intel";

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 195 + (h % 80); // stays in the brand's blue-to-violet band
}

function initials(name: string, wallet: string): string {
  if (!name || name.startsWith("0x")) return wallet.slice(2, 4).toUpperCase();
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  // Two words that both start with a letter give two initials; otherwise the first word's first two letters.
  if (parts.length >= 2 && /^[a-zA-Z]/.test(parts[1]!)) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? name).slice(0, 2).toUpperCase();
}

/** Deterministic monogram for a wallet: the same wallet always gets the same tint. */
export function TraderAvatar({ wallet, name, size = 28, className }: { wallet: string; name: string; size?: number; className?: string }) {
  const h = hashHue(wallet.toLowerCase());
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `hsl(${h} 75% 55% / 0.16)`, color: `hsl(${h} 90% 78%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 80% 62% / 0.35)` }}
    >
      {initials(name, wallet)}
    </span>
  );
}

/** Name, rank and short address, linking to the wallet's page in Wallet Explorer. */
export function TraderIdentity({ wallet, name, rank, size = 28, className, linked = true }: { wallet: string; name: string; rank?: number | null; size?: number; className?: string; linked?: boolean }) {
  const body = (
    <>
      <TraderAvatar wallet={wallet} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{name}</span>
        <span className="tabular block truncate font-mono text-[11px] text-muted-foreground">
          {rank ? `#${rank} · ` : ""}
          {shortAddress(wallet)}
        </span>
      </span>
    </>
  );
  if (!linked) return <span className={cn("flex min-w-0 items-center gap-2.5", className)}>{body}</span>;
  return (
    <Link href={walletHref(wallet)} className={cn("group flex min-w-0 items-center gap-2.5", className)}>
      {body}
    </Link>
  );
}
