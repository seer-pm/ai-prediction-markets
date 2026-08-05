import { cn } from "@/utils/cn";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { Skeleton } from "./Skeleton";

/**
 * The shared table shell. Five near-identical implementations used to carry
 * their own copies of these class strings; this one also right-aligns numbers
 * and pins both the header and the first column while you scan.
 */

/**
 * The scroll box the table lives in.
 *
 * `overflow-x` alone still makes this a scroll container on both axes, so a
 * sticky header inside it resolves against this box rather than the viewport —
 * offsetting the header by the app-bar height parked it in the middle of the
 * rows. Bounding the height instead makes the box the intended scroll context:
 * the header pins to its top, the first column pins to its left, and a
 * two-hundred-row diff doesn't stretch the page.
 */
export function TableScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-h-[min(72vh,46rem)] overflow-auto overscroll-contain", className)}>
      {children}
    </div>
  );
}

export function Table({
  children,
  minWidth = 720,
  className,
}: {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <table
      // `border-separate` (with zero spacing) rather than `border-collapse`:
      // collapsed borders are dropped from sticky sections, so the header rule
      // would disappear the moment the header pinned.
      className={cn("w-full border-separate border-spacing-0 text-body", className)}
      style={{ minWidth }}
    >
      {children}
    </table>
  );
}

/**
 * Pass `multiRow` and supply `Thr` rows directly when the columns need a
 * grouping band above them (e.g. UP / DOWN in the originality table).
 */
export function Thead({ children, multiRow = false }: { children: ReactNode; multiRow?: boolean }) {
  return (
    <thead className="sticky top-0 z-20">
      {multiRow ? children : <tr>{children}</tr>}
    </thead>
  );
}

export function Thr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={className}>{children}</tr>;
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Pins this header cell when the table scrolls horizontally. */
  pinned?: boolean;
}

export function Th({ numeric, pinned, className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-rule bg-sunken px-3 py-3 text-label font-semibold tracking-wider whitespace-nowrap text-ink-3 uppercase sm:px-6",
        numeric ? "text-right" : "text-left",
        pinned &&
          "sticky left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-rule",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("group transition-colors hover:bg-sunken", className)}>{children}</tr>;
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  pinned?: boolean;
}

export function Td({ numeric, pinned, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        "border-b border-rule px-3 py-4 whitespace-nowrap text-ink-2 sm:px-6",
        numeric && "text-right font-mono",
        pinned &&
          "sticky left-0 z-[1] bg-surface transition-colors group-hover:bg-sunken after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-rule",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex h-16 items-center gap-4 px-6">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={columnIndex === 0 ? "flex-1" : "w-20"}
              height={12}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Row count / filter controls above a table. */
export function TableToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-rule px-6 py-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}
