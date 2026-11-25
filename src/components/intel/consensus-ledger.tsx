import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { ConsensusHolding } from "@/lib/whales";
import { Ledger, LedgerBody, LedgerHead, ROW, Td, Th, rowIndex } from "@/components/shared/ledger";
import { cents, compact, dateShort } from "@/lib/format";
import { SIGNAL_KINDS, signalKind } from "./signal";

const KIND_LABEL = Object.fromEntries(SIGNAL_KINDS.map((k) => [k.key, k.label])) as Record<string, string>;

/** Paid → now, with the move in words. The entry price beside it is the percentage's denominator. */
export function PaidNow({ entry, now }: { entry: number; now: number }) {
  const change = entry > 0 ? (now - entry) / entry : 0;
  const flat = Math.abs(change) < 0.005;
  return (
    <>
      <div className="tabular text-sm whitespace-nowrap">
        <span className="text-muted-foreground">{cents(entry)} →</span> <span className="font-semibold">{cents(now)}</span>
      </div>
      {/* Signed, never colored: an open position has not won or lost anything yet. */}
      <div className="tabular mt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">{flat ? "Unchanged since entry" : `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% since entry`}</div>
    </>
  );
}

/** "25 of 1,000": a count of traders never appears without the field it came from. */
export function HoldersOf({ n, tracked }: { n: number; tracked: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="figure text-base font-semibold">{n}</span>
      <span className="text-xs text-muted-foreground"> of {tracked.toLocaleString("en-US")}</span>
    </span>
  );
}

/**
 * Consensus outcomes as a ledger, the way the track record lists its calls:
 * the market and side, how many of the tracked traders hold it (with the
 * denominator), the money on that side, what they paid against the price now,
 * and when it closes.
 *
 * `locked` rows (homepage only) print real counts, money and dates with the
 * market name withheld, so "more in Pro" is a claim a visitor can see the
 * size of rather than a padlock icon. They are rendered on the server only.
 */
export function ConsensusLedger({
  rows,
  tracked,
  href,
  locked = [],
  footer,
  label,
}: {
  rows: ConsensusHolding[];
  tracked: number;
  href?: (h: ConsensusHolding) => string;
  locked?: ConsensusHolding[];
  footer?: ReactNode;
  label: string;
}) {
  return (
    <Ledger label={label} footer={footer}>
      <LedgerHead>
        <Th>Market &amp; side</Th>
        <Th right className="hidden sm:table-cell">
          Top traders
        </Th>
        <Th right>Money on side</Th>
        <Th right className="hidden md:table-cell">
          Paid → now
        </Th>
        <Th right className="hidden lg:table-cell">
          Closes
        </Th>
      </LedgerHead>
      <LedgerBody>
        {rows.map((h, i) => (
          <tr key={h.tokenId} style={rowIndex(i)} className={ROW}>
            <Td className="max-w-md">
              {href ? (
                <Link href={href(h)} className="line-clamp-2 text-[13px] leading-snug text-foreground hover:text-primary">
                  {h.title}
                </Link>
              ) : (
                <span className="line-clamp-2 text-[13px] leading-snug">{h.title}</span>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold tracking-wide text-secondary-foreground uppercase">{h.outcome}</span>
                <span aria-hidden="true">·</span>
                <span>{KIND_LABEL[signalKind(h)]}</span>
                {/* Phones drop the traders column, so the count moves here, on its own line. */}
                <span className="basis-full sm:hidden">
                  {h.holders} of {tracked.toLocaleString("en-US")} top traders
                </span>
              </div>
            </Td>
            <Td right className="hidden sm:table-cell">
              <HoldersOf n={h.holders} tracked={tracked} />
            </Td>
            <Td right figure>
              ${compact(h.totalValue)}
            </Td>
            <Td right className="hidden md:table-cell">
              <PaidNow entry={h.avgEntry} now={h.currentPrice} />
            </Td>
            <Td right className="hidden text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
              {h.endDate ? dateShort(h.endDate) : "No stated close"}
            </Td>
          </tr>
        ))}
        {locked.map((h, i) => (
          <tr key={h.tokenId} style={rowIndex(rows.length + i)} className={ROW}>
            <Td className="max-w-md">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-[13px] leading-snug text-muted-foreground">{h.category === "Other" ? "Market" : `${h.category} market`} · name shown to Pro members</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {KIND_LABEL[signalKind(h)]}
                    <span className="block sm:hidden">
                      {h.holders} of {tracked.toLocaleString("en-US")} top traders
                    </span>
                  </div>
                </div>
              </div>
            </Td>
            <Td right className="hidden sm:table-cell">
              <HoldersOf n={h.holders} tracked={tracked} />
            </Td>
            <Td right figure>
              ${compact(h.totalValue)}
            </Td>
            <Td right className="hidden md:table-cell">
              <PaidNow entry={h.avgEntry} now={h.currentPrice} />
            </Td>
            <Td right className="hidden text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
              {h.endDate ? dateShort(h.endDate) : "No stated close"}
            </Td>
          </tr>
        ))}
      </LedgerBody>
    </Ledger>
  );
}
