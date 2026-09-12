import { Tooltip } from "@/components/ui";
import { formatAmount } from "@/utils/format";
import type { ReactNode } from "react";

/**
 * The volume figure above a contest chart, with the other way of counting it on hover.
 *
 * Every swap has two legs, and the same trade reads very differently depending on which one is
 * counted. `cash` is the collateral leg — what was actually paid and received, in the market's own
 * collateral. `tokens` is the outcome-token leg — how many shares changed hands. They differ by the
 * price those shares traded at, which on a market with many outcomes is a large factor: L1's parent
 * pools have moved about 15.8k sUSDS against 1.87M outcome tokens, an average price under a cent.
 *
 * Cash is what the tabs print, because it is the figure that compares across markets trading at
 * different prices; the notional count sits in the tooltip rather than in a second line of the
 * header, which is already carrying the refresh control.
 */
interface VolumeLabelProps {
  /** "Volume", "Total volume", "Average volume per repository" — the tabs differ. */
  label: string;
  /** Collateral paid and received, in `symbol` units. */
  cash: number;
  /** Outcome tokens traded. Absent on a chart blob written before the count was stored. */
  tokens?: number;
  /** How to name the collateral: "sUSDS", or a parent outcome token on a conditional market. */
  symbol: string;
  /** Trailing text on the visible label, e.g. " across 37 markets". */
  suffix?: ReactNode;
  /** How the figures were folded, for the tooltip: "totalled over 37 markets", "averaged per repository". */
  scope?: string;
  /** An extra line of tooltip, where the unit itself needs explaining. */
  note?: ReactNode;
}

export function VolumeLabel({
  label,
  cash,
  tokens,
  symbol,
  suffix,
  scope,
  note,
}: VolumeLabelProps) {
  const over = scope ? `, ${scope}` : "";

  return (
    <Tooltip
      content={
        <div className="space-y-1.5">
          <div>
            <span className="font-mono">
              {formatAmount(cash)} {symbol}
            </span>{" "}
            cash — the collateral leg of every swap: what was paid and received{over}.
          </div>
          <div>
            {tokens === undefined ? (
              "Notional volume has not been recorded for this chart yet."
            ) : (
              <>
                <span className="font-mono">{formatAmount(tokens)}</span> notional — the outcome-token
                leg: how many shares changed hands{over}.
              </>
            )}
          </div>
          {note && <div className="text-ink-4">{note}</div>}
        </div>
      }
    >
      <span className="cursor-help">
        {label}{" "}
        <span className="font-mono text-ink underline decoration-dotted decoration-ink-4 underline-offset-4">
          {formatAmount(cash)} {symbol}
        </span>
        {suffix}
      </span>
    </Tooltip>
  );
}
