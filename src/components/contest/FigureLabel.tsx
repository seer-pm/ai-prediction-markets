import { Tooltip } from "@/components/ui";
import { useSusdsUsdRate } from "@/hooks/useConvertSavingsTokens";
import { collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import type { ReactNode } from "react";

/**
 * A pool figure above a contest chart — volume, or current liquidity — with the other way of counting
 * it on hover.
 *
 * A pool holds and moves two tokens, and the same quantity reads very differently depending on which
 * one is counted. `cash` is the collateral leg — the money side, in the market's own collateral.
 * `tokens` is the outcome-token leg — the share side. They differ by the price those shares trade at,
 * which on a market with many outcomes is a large factor: L1's parent pools have moved about 18.5k
 * sUSDS against 1.87M outcome tokens, an average price under a cent.
 *
 * Cash is what the tabs print, because it is the figure that compares across markets trading at
 * different prices; the notional — the token count, each token paying out at most one unit of
 * collateral — sits in the tooltip rather than in a second line of the header, which is already
 * carrying the refresh control. Both are printed in dollars when the unit is sUSDS; a conditional
 * market's parent outcome token has no dollar price, so those stay in their own unit.
 *
 * A chart blob written before the token count was stored has nothing to contrast, so there is no
 * tooltip at all and no dotted underline promising one — a hover that only restates the number
 * already on screen is worse than no hover. The exception is a market whose `note` has something to
 * say regardless, which is the whole reason the note exists: on a conditional market it is what
 * discloses that the figure is not denominated in sUSDS.
 */
interface FigureLabelProps {
  /** "Volume", "Liquidity", "Average volume per repository" — the tabs differ. */
  label: string;
  /** The collateral leg, in `symbol` units. */
  cash: number;
  /** The outcome-token leg. Absent on a chart blob written before the count was stored. */
  tokens?: number;
  /** How to name the collateral: "sUSDS", or a parent outcome token on a conditional market. */
  symbol: string;
  /** Trailing text on the visible label, e.g. " across 37 markets". */
  suffix?: ReactNode;
  /** An extra line of tooltip, where the unit itself needs naming. */
  note?: ReactNode;
}

export function FigureLabel({ label, cash, tokens, symbol, suffix, note }: FigureLabelProps) {
  // sUSDS figures read in dollars. Until the rate arrives they stay in sUSDS rather than
  // pretending one sUSDS is one dollar.
  const susdsRate = useSusdsUsdRate();
  const usdRate = symbol === collateral.symbol ? susdsRate : undefined;

  const format = (value: number) =>
    usdRate === undefined
      ? `${formatAmount(value)} ${symbol}`
      : `$${formatAmount(value * usdRate)}`;
  const visible = format(cash);

  if (tokens === undefined && !note) {
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
        <div className="space-y-1.5">
          {tokens !== undefined && (
            <>
              <div>
                <span className="font-mono">{visible}</span> cash
              </div>
              <div>
                {/* An outcome token pays out at most one unit of collateral, so the token count
                    is the notional: what the traded shares would be worth if they all won. */}
                <span className="font-mono">{format(tokens)}</span> notional
              </div>
            </>
          )}
          {note && <div className="text-ink-4">{note}</div>}
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
