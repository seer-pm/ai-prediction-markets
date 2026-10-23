import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";
import type React from "react";

interface OutcomeBarProps {
  /** Market price of the first side (YES, UP), 0-1. `null` when its pool does not exist. */
  first: number | null;
  /** Market price of the second side (NO, DOWN), 0-1. `null` when its pool does not exist. */
  second: number | null;
  /**
   * The reader's own estimate of the first side's share, 0-1, drawn as a tick across the bar so
   * the disagreement is visible before any number is read. Omitted, or null, draws none.
   */
  marker?: number | null;
  /** How the two prices print beside the bar. Whole percentages by default. */
  format?: (value: number) => string;
  /** The bar's width in px, shared down a column so the bars compare. */
  track?: number;
  className?: string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * The two halves of one reading on one 0-1 scale: the first side in `--seer-series-1` from the
 * left edge, the second in `--seer-series-2` from the right. Neither is a gain or a loss, so neither
 * wears a status colour, and the pair matches Futarchy's pass and fail.
 *
 * Both segments are drawn at their raw price, so the bar is honest about the pair: when the two sum
 * to less than 1 the track shows between them, and when they sum to more (the arbitrage state these
 * contests trade on) they overlap. A prediction tick on the same scale therefore lands right of the
 * purple end exactly when the market underprices the first side, which is what the Difference
 * column says in numbers. The numbers are always printed, so colour is never the only channel.
 */
export function OutcomeBar({
  first,
  second,
  marker = null,
  format = percent,
  track = 120,
  className,
}: OutcomeBarProps) {
  if (first === null && second === null) {
    return <Badge tone="quiet">No pool</Badge>;
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-14 shrink-0 text-right text-data font-semibold text-ink">
        {first === null ? "—" : format(first)}
      </span>
      <span
        aria-hidden
        className="relative block h-2 shrink-0 rounded-full bg-rule"
        style={{ width: track }}
      >
        {first !== null && (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-seer-series-1"
            style={{ width: `${clamp(first) * 100}%` }}
          />
        )}
        {/* A surface ring keeps the two marks apart where they meet or overlap. */}
        {second !== null && (
          <span
            className="absolute inset-y-0 right-0 rounded-full bg-seer-series-2 ring-2 ring-surface"
            style={{ width: `${clamp(second) * 100}%` }}
          />
        )}
        {/* The tick eases in from the bar's origin when predictions load: the moment the reader's
            view meets the market's across the whole field. */}
        {marker !== null && (
          <span
            className="absolute -top-1 -bottom-1 left-[var(--tick)] w-0.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface transition-[left,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] starting:left-0 starting:opacity-0"
            style={{ "--tick": `${clamp(marker) * 100}%` } as React.CSSProperties}
          />
        )}
      </span>
      <span className="w-14 shrink-0 text-data text-ink-3">{second === null ? "—" : format(second)}</span>
    </div>
  );
}
