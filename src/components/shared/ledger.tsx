import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The track record's table, as parts, so every ledger in the app is set the
 * same way: micro-label headers, hairline rows, right-aligned figures, and a
 * card that scrolls sideways inside itself rather than widening the page.
 *
 * Phone layout is the caller's choice per column: hide secondary columns with
 * `className="hidden sm:table-cell"` and repeat what matters in the first
 * cell's sub-line, so a phone reader never has to scroll a table sideways.
 */
export function Ledger({ children, minWidth, label, className, footer }: { children: ReactNode; minWidth?: string; label?: string; className?: string; footer?: ReactNode }) {
  return (
    <div className={cn("card-surface min-w-0 overflow-hidden", className)}>
      {/* Positioned so absolutely placed descendants (sr-only labels) are clipped here, not by the page. */}
      <div className="scrollbar-thin relative overflow-x-auto">
        <table className="w-full border-collapse text-left" style={minWidth ? { minWidth } : undefined} aria-label={label}>
          {children}
        </table>
      </div>
      {footer}
    </div>
  );
}

export function LedgerHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border/60">{children}</tr>
    </thead>
  );
}

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th scope="col" className={cn("label-micro px-4 py-3 font-medium sm:px-5", right && "text-right", className)}>
      {children}
    </th>
  );
}

/** Rows enter 40ms apart (.stagger-in); give each row its index with `rowIndex`. */
export function LedgerBody({ children }: { children: ReactNode }) {
  return <tbody className="stagger-in divide-y divide-border/40">{children}</tbody>;
}

export const rowIndex = (i: number) => ({ "--i": i }) as CSSProperties;

export const ROW = "transition-colors hover:bg-surface-2/60";

export function Td({ children, right, figure, className, colSpan }: { children?: ReactNode; right?: boolean; figure?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3.5 align-middle sm:px-5", right && "text-right", figure && "figure text-base font-semibold", className)}>
      {children}
    </td>
  );
}
