import { OriginalityTableData, ZcashTableData } from "@/types";
import { Address } from "viem";
import { NO_INDEX, YES_INDEX } from "./zcashMarkets";

export interface CompleteSetMerge {
  marketId: Address;
  /** Every outcome token of the market, Invalid included — what one merge burns. */
  tokens: Address[];
  amount: bigint;
}

/**
 * Splits what a wallet holds in each market into the part that is a complete set and the part
 * that is not.
 *
 * A complete set — every outcome token in equal amounts, Invalid included — merges back into
 * exactly one collateral token. Sold instead, its two traded sides go into two separate pools and
 * push both prices down: on the incorrect round-3 set (2026-10-02) that returned about a third of
 * what a merge does, because most of what people held there had been minted as sets. Selling only
 * pays more while a market's prices sum above 1, and then by no more than that excess.
 *
 * `balances` is one entry per row per wrapped token, in `rows.flatMap((row) => row.wrappedTokens)`
 * order. `left` is each row's balances once its merge is taken out, in `wrappedTokens` order.
 */
function planMerges(
  rows: readonly { marketId: string; wrappedTokens: Address[] }[],
  balances: readonly bigint[],
): { merges: CompleteSetMerge[]; left: bigint[][] } {
  const merges: CompleteSetMerge[] = [];
  let offset = 0;
  const left = rows.map((row) => {
    const held = balances.slice(offset, offset + row.wrappedTokens.length);
    offset += row.wrappedTokens.length;
    // Fewer than two sides and Invalid is not a market this can merge; an unread balance counts as
    // none, so nothing is merged that might not be there.
    const amount =
      row.wrappedTokens.length >= 3
        ? held.reduce((min, balance) => (balance < min ? balance : min), held[0] ?? 0n)
        : 0n;
    if (amount > 0n) {
      merges.push({ marketId: row.marketId as Address, tokens: [...row.wrappedTokens], amount });
    }
    return row.wrappedTokens.map((_, index) => (held[index] ?? 0n) - amount);
  });
  return { merges, left };
}

/**
 * Repo markets: DOWN + UP + Invalid. `rows` comes back with `upBalance`/`downBalance` reduced to
 * what the merges leave, which is what remains to be sold.
 */
export function planCompleteSetMerges(
  rows: OriginalityTableData[],
  balances: readonly bigint[],
): { merges: CompleteSetMerge[]; rows: OriginalityTableData[] } {
  const { merges, left } = planMerges(rows, balances);
  return {
    merges,
    rows: rows.map((row, index) => ({
      ...row,
      downBalance: left[index][0] ?? 0n,
      upBalance: left[index][1] ?? 0n,
    })),
  };
}

/** Zcash markets: YES + NO + Invalid, with `yesBalance`/`noBalance` reduced the same way. */
export function planZcashSetMerges(
  rows: ZcashTableData[],
  balances: readonly bigint[],
): { merges: CompleteSetMerge[]; rows: ZcashTableData[] } {
  const { merges, left } = planMerges(rows, balances);
  return {
    merges,
    rows: rows.map((row, index) => ({
      ...row,
      yesBalance: left[index][YES_INDEX] ?? 0n,
      noBalance: left[index][NO_INDEX] ?? 0n,
    })),
  };
}
