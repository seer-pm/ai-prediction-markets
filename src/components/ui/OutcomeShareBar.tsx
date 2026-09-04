import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";

/** Fixed, like `OutcomeBar`'s track: bars are only comparable down a column if they share a scale. */
const TRACK = 96;

interface OutcomeShareBarProps {
  /** Market price of this outcome, 0-1. `null` when the pool does not exist. */
  price: number | null;
  /**
   * Sum of every priced outcome in the same market. The bar is drawn as this outcome's share of
   * that sum rather than of 1, so a market whose prices drift off 1 still reads as a distribution —
   * while the printed number gives away what a share actually costs.
   */
  sum: number;
  className?: string;
}

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

/**
 * One categorical outcome's price, as a number and a bar.
 *
 * `OutcomeBar` is hard-wired to a binary yes/no pair — two segments filling one track — which a
 * 3-to-5-way single-select market cannot use: each outcome is its own row here, so each needs its
 * own bar on a shared scale.
 *
 * The percentage is always printed, so colour is never the only channel.
 */
export function OutcomeShareBar({ price, sum, className }: OutcomeShareBarProps) {
  if (price === null) {
    return <Badge tone="quiet">No pool</Badge>;
  }

  const share = sum > 0 ? price / sum : 0;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-9 shrink-0 text-right font-mono text-body font-semibold text-ink">
        {pct(price)}
      </span>
      <span
        aria-hidden
        className="h-2 shrink-0 overflow-hidden rounded-full bg-rule"
        style={{ width: TRACK }}
      >
        <span
          className="block h-full bg-primary"
          style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }}
        />
      </span>
    </div>
  );
}
