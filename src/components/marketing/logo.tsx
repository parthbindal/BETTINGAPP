import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 120 120" className="size-6 shrink-0 text-primary [filter:drop-shadow(0_0_5px_rgba(96,165,250,0.45))]" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.8">
          <line x1="106" y1="60" x2="75" y2="60" />
          <line x1="83" y1="20.2" x2="68.5" y2="44.5" />
          <line x1="37" y1="20.2" x2="51.5" y2="44.5" />
          <line x1="14" y1="60" x2="45" y2="60" />
          <line x1="37" y1="99.8" x2="51.5" y2="75.5" />
          <line x1="83" y1="99.8" x2="68.5" y2="75.5" />
        </g>
        <rect x="47" y="47" width="26" height="26" rx="6" transform="rotate(45 60 60)" fill="#8B5CF6" />
        <circle cx="60" cy="60" r="2.8" fill="#EAF6FF" />
      </svg>
      <span className="text-[15px] tracking-[0.12em]">EDGEWISE</span>
    </Link>
  );
}
