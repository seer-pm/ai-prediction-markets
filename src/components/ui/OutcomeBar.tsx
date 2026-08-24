import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";

interface OutcomeBarProps {
  /** Market price of YES, 0-1. `null` when the pool does not exist. */
  yes: number | null;
  /** Market price of NO, 0-1. `null` when the pool does not exist. */
  no: number | null;
  className?: string;
}

/** Fixed, like `DeltaCell`'s track: bars are only comparable down a column if they share a scale. */
const TRACK = 120;

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

/**
 * What the market pays for yes and no, as one bar.
 *
 * The two segments are sized by each side's share of the pair, so the bar always fills the track.
 * The numbers beside it are the raw prices. That split matters: when YES and NO sum to more than 1
 * — the arbitrage state this contest trades on — the widths still read as "what the market thinks"
 * while the numbers give away what it actually costs to buy both.
 *
 * The percentages are always printed, so colour is never the only channel.
 */
export function OutcomeBar({ yes, no, className }: OutcomeBarProps) {
  if (yes === null && no === null) {
    return <Badge tone="quiet">No pool</Badge>;
  }

  // One pool missing is not the same as a price of zero. Fall back to the other side's complement
  // so the bar still shows the shape of the market, and let the "—" label say what is unknown.
  const yesShare = yes === null ? 1 - (no as number) : no === null ? yes : yes / (yes + no);

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-9 shrink-0 text-right font-mono text-body font-semibold text-long">
        {pct(yes)}
      </span>
      <span
        aria-hidden
        className="flex h-2 shrink-0 overflow-hidden rounded-full bg-rule"
        style={{ width: TRACK }}
      >
        <span
          className="h-full bg-long"
          style={{ width: `${Math.min(Math.max(yesShare, 0), 1) * 100}%` }}
        />
        <span className="h-full flex-1 bg-short" />
      </span>
      <span className="w-9 shrink-0 font-mono text-body font-semibold text-short">{pct(no)}</span>
    </div>
  );
}
