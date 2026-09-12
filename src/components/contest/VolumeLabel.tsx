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
 * pools have moved about 18.5k sUSDS against 1.87M outcome tokens, an average price under a cent.
 *
 * Cash is what the tabs print, because it is the figure that compares across markets trading at
 * different prices; the token count sits in the tooltip rather than in a second line of the header,
 * which is already carrying the refresh control. The tooltip states the two amounts against each
 * other — a hover is not the place to explain what a swap leg is, and the collateral line needs no
 * label of its own once the token line names what it is being contrasted with.
 *
 * A chart blob written before the token count was stored has nothing to contrast, so there is no
 * tooltip at all and no dotted underline promising one — a hover that only restates the number
 * already on screen is worse than no hover. The exception is a market whose `note` has something to
 * say regardless, which is the whole reason the note exists: on a conditional market it is what
 * discloses that the figure is not denominated in sUSDS.
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
  /** An extra line of tooltip, where the unit itself needs naming. */
  note?: ReactNode;
}

export function VolumeLabel({ label, cash, tokens, symbol, suffix, note }: VolumeLabelProps) {
  const amount = `${formatAmount(cash)} ${symbol}`;

  if (tokens === undefined && !note) {
    return (
      <span>
        {label} <span className="font-mono text-ink">{amount}</span>
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
              <div className="font-mono">{amount}</div>
              <div>
                <span className="font-mono">{formatAmount(tokens)}</span> outcome tokens
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
          {amount}
        </span>
        {suffix}
      </span>
    </Tooltip>
  );
}
