import { Tooltip } from "@/components/ui";
import { useSusdsUsdRate } from "@/hooks/useConvertSavingsTokens";
import { collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import type { ReactNode } from "react";

/**
 * A pool figure above a contest chart — volume, or current liquidity — printed in dollars.
 *
 * A pool holds and moves two tokens. `cash` is the collateral leg — the money side. `tokens` is the
 * outcome-token leg — the shares, each paying out at most one unit of collateral, so their count is
 * what the traded shares would pay if they all won. The two differ by the price the shares trade at,
 * which on a market with many outcomes is a large factor: L1's parent pools have moved about 18.5k
 * sUSDS against 1.87M outcome tokens, an average price under a cent.
 *
 * Cash is what the tabs print; the share count sits in the tooltip as the notional volume, and only
 * on volume — for liquidity it answers nothing a trader asks, so liquidity callers leave `tokens` out
 * and get a plain figure with no hover.
 *
 * A conditional market's collateral is another market's outcome token, which has no dollar price.
 * The tab passes `unitPrice` — one sUSDS spread over that parent market's outcomes — and the figure
 * carries a `~` rather than naming a token the trader never sees.
 */
interface FigureLabelProps {
  /** "Volume", "Liquidity", "Total volume" — the tabs differ. */
  label: string;
  /** The collateral leg, in collateral units. */
  cash: number;
  /** The outcome-token leg. Absent on liquidity, and on a blob written before it was stored. */
  tokens?: number;
  /** sUSDS per unit of collateral: 1 on an sUSDS market, 1 / parent outcomes on a conditional one. */
  unitPrice?: number;
  /** Trailing text on the visible label, e.g. " across 37 markets". */
  suffix?: ReactNode;
}

export function FigureLabel({ label, cash, tokens, unitPrice = 1, suffix }: FigureLabelProps) {
  // Until the rate arrives the figure stays in sUSDS rather than pretending one sUSDS is one dollar.
  const usdRate = useSusdsUsdRate();
  const estimated = unitPrice !== 1;

  const format = (value: number) => {
    const susds = value * unitPrice;
    return usdRate === undefined
      ? `${formatAmount(susds)} ${collateral.symbol}`
      : `$${formatAmount(susds * usdRate)}`;
  };
  const visible = `${estimated ? "~" : ""}${format(cash)}`;

  if (tokens === undefined) {
    return (
      <span>
        {label} <span className="font-mono text-ink">{visible}</span>
        {suffix}
      </span>
    );
  }

  return (
    <Tooltip
      content={
        <div>
          Notional volume: <span className="font-mono">{format(tokens)}</span>
        </div>
      }
    >
      <span className="cursor-help">
        {label}{" "}
        <span className="font-mono text-ink underline decoration-dotted decoration-ink-4 underline-offset-4">
          {visible}
        </span>
        {suffix}
      </span>
    </Tooltip>
  );
}
