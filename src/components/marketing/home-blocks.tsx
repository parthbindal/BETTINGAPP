import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { PublicMove } from "@/lib/data/public-cache";
import { TraderAvatar } from "@/components/intel/trader-identity";
import { Ledger, LedgerBody, LedgerHead, ROW, Td, Th, rowIndex } from "@/components/shared/ledger";
import { polymarketMarketUrl } from "@/lib/intel";
import { cents, compact, utcStamp } from "@/lib/format";

/**
 * Big moves by the tracked top traders, as a ledger: what was traded, by whom
 * (with their all-time rank), how big, at what price, and an absolute UTC
 * time. The homepage shows these an hour late, like the free channel; the
 * caller says so in the section heading.
 */
export function MovesLedger({ moves }: { moves: PublicMove[] }) {
  return (
    <Ledger label="Recent big moves by top traders">
      <LedgerHead>
        <Th>Market &amp; trade</Th>
        <Th className="hidden sm:table-cell">Trader</Th>
        <Th right>Size</Th>
        <Th right className="hidden md:table-cell">
          Price
        </Th>
        <Th right className="hidden md:table-cell">
          When
        </Th>
      </LedgerHead>
      <LedgerBody>
        {moves.map((m, i) => {
          const url = polymarketMarketUrl(m.title);
          return (
            <tr key={m.id} style={rowIndex(i)} className={ROW}>
              <Td className="max-w-md">
                <div className="flex items-start gap-1.5">
                  <span className="line-clamp-2 text-[13px] leading-snug">{m.title}</span>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary" aria-label="Find on Polymarket US">
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                  <span>{m.side === "BUY" ? "Bought" : "Sold"}</span>
                  <span className="max-w-[14rem] truncate font-semibold tracking-wide text-secondary-foreground uppercase">{m.outcome}</span>
                  <span className="md:hidden">at {cents(m.avgPrice)}</span>
                  <span className="sm:hidden">
                    · {m.traderName} (#{m.rank})
                  </span>
                  <span className="md:hidden">· {utcStamp(m.lastTradeAt)}</span>
                </div>
              </Td>
              <Td className="hidden sm:table-cell">
                <span className="flex min-w-0 items-center gap-2">
                  <TraderAvatar wallet={m.wallet} name={m.traderName} size={24} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block max-w-[10rem] truncate text-[13px] font-medium">{m.traderName}</span>
                    <span className="tabular block text-[11px] text-muted-foreground">#{m.rank} all-time</span>
                  </span>
                </span>
              </Td>
              <Td right figure>
                ${compact(Math.round(m.usd))}
              </Td>
              <Td right className="tabular hidden text-sm md:table-cell">
                {cents(m.avgPrice)}
              </Td>
              <Td right className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {utcStamp(m.lastTradeAt)}
              </Td>
            </tr>
          );
        })}
      </LedgerBody>
    </Ledger>
  );
}

/** A question that opens in place; no script needed. */
export function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border py-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {q}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
