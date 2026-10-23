import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";

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
 * The two halves of one reading as one bar: the first side in `--seer-series-1` from the left, the
 * second in `--seer-series-2` from the right. Neither is a gain or a loss, so neither wears a status
 * colour, and the pair matches Futarchy's pass and fail.
 *
 * The segments are sized by each side's share of the pair, so the bar always fills the track. The
 * numbers beside it are the raw prices. That split matters: when the two sum to more than 1 (the
 * arbitrage state these contests trade on) the widths still read as what the market thinks while
 * the numbers give away what it costs to buy both. The numbers are always printed, so colour is
 * never the only channel.
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

  // One pool missing is not the same as a price of zero. Fall back to the other side's complement
  // so the bar still shows the shape of the market, and let the "—" label say what is unknown.
  const firstShare = clamp(
    first === null ? 1 - (second as number) : second === null ? first : first / (first + second),
  );

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-14 shrink-0 text-right text-data font-semibold text-ink">
        {first === null ? "—" : format(first)}
      </span>
      <span aria-hidden className="relative flex h-2 shrink-0 gap-0.5" style={{ width: track }}>
        <span
          className="h-full rounded-l-full bg-seer-series-1"
          style={{ width: `calc(${firstShare * 100}% - 1px)` }}
        />
        <span className="h-full flex-1 rounded-r-full bg-seer-series-2" />
        {marker !== null && (
          <span
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface"
            style={{ left: `${clamp(marker) * 100}%` }}
          />
        )}
      </span>
      <span className="w-14 shrink-0 text-data text-ink-3">{second === null ? "—" : format(second)}</span>
    </div>
  );
}
