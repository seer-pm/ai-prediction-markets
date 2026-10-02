import { OriginalityTableData } from "@/types";
import { Address } from "viem";

export interface CompleteSetMerge {
  marketId: Address;
  /** Every outcome token of the market, Invalid included — what one merge burns. */
  tokens: Address[];
  amount: bigint;
}

/**
 * Splits what a wallet holds in each repo market into the part that is a complete set and the
 * part that is not.
 *
 * A complete set — DOWN + UP + Invalid in equal amounts — merges back into exactly one collateral
 * token. Sold instead, its UP and DOWN go into two separate pools and push both prices down: on
 * the incorrect round-3 set (2026-10-02) that returned about a third of what a merge does, because
 * most of what people held there had been minted as sets.
 *
 * `balances` is one entry per row per wrapped token, in `rows.flatMap((row) => row.wrappedTokens)`
 * order. `rows` comes back with `upBalance`/`downBalance` reduced to what the merges leave, which
 * is what remains to be sold.
 */
export function planCompleteSetMerges(
  rows: OriginalityTableData[],
  balances: readonly bigint[],
): { merges: CompleteSetMerge[]; rows: OriginalityTableData[] } {
  const merges: CompleteSetMerge[] = [];
  let offset = 0;
  const remaining = rows.map((row) => {
    const held = balances.slice(offset, offset + row.wrappedTokens.length);
    offset += row.wrappedTokens.length;
    // Fewer than DOWN, UP and Invalid is not a market this can merge; an unread balance counts as
    // none, so nothing is merged that might not be there.
    const amount =
      row.wrappedTokens.length >= 3
        ? held.reduce((min, balance) => (balance < min ? balance : min), held[0] ?? 0n)
        : 0n;
    if (amount > 0n) {
      merges.push({ marketId: row.marketId as Address, tokens: [...row.wrappedTokens], amount });
    }
    return { ...row, downBalance: (held[0] ?? 0n) - amount, upBalance: (held[1] ?? 0n) - amount };
  });
  return { merges, rows: remaining };
}
