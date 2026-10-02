import type { TxPhase } from "@/types";

/** What each stage is called in the run ledger. */
export const TX_PHASE_LABELS: Record<TxPhase, string> = {
  authorize: "Authorise the run",
  mint: "Mint complete sets",
  sell: "Sell overvalued outcomes",
  // Reads as the opening stage of a sell-all and as the mid-run refresh in a
  // strategy, so it stays neutral about which.
  requote: "Get quotes",
  merge: "Merge complete sets",
  buy: "Buy undervalued outcomes",
  redeem: "Redeem settled positions",
  unwind: "Return minted tokens",
  settle: "Finish up",
  work: "Working",
};

/**
 * The stages each operation walks through, in order. The ledger shows the
 * whole list up front so the length of the run is never a surprise.
 */
export const STRATEGY_PHASES: TxPhase[] = [
  "authorize",
  "mint",
  "sell",
  "requote",
  "merge",
  "buy",
  "settle",
];

// Quoting leads here: a sell-all prices every position off-chain before it asks
// for a signature, and that read is the slowest part of the run.
export const SELL_ALL_PHASES: TxPhase[] = ["requote", "authorize", "sell", "merge", "settle"];

// A withdraw merges complete sets before it prices anything, so the signature comes first and the
// quotes cover only what the merges left over.
export const WITHDRAW_PHASES: TxPhase[] = ["authorize", "unwind", "requote", "sell", "merge", "settle"];

// The same run where a market is collateralised in sUSDS itself: the first merge already pays
// sUSDS, so there is no parent level left to merge afterwards.
export const TOP_LEVEL_WITHDRAW_PHASES: TxPhase[] = ["authorize", "unwind", "requote", "sell", "settle"];

/**
 * What a sell-all dialog says when the run merges complete sets before it sells. `sides` names
 * the two traded outcomes, e.g. "UP and DOWN".
 */
export const mergeFirstSellCopy = (sides: string) => ({
  description: `Merges your matched ${sides} tokens back at full value, sells what is left over, and returns the sUSDS to your trade wallet.`,
  warning:
    "Matched tokens come back in full. Only unmatched tokens are sold, and selling them all at once can still move the price against you.",
});

export const REDEEM_PHASES: TxPhase[] = ["authorize", "redeem", "settle"];

export const SIMPLE_PHASES: TxPhase[] = ["authorize", "work", "settle"];

export type RunStatus = "idle" | "running" | "succeeded" | "failed";

/** Maps a react-query mutation's flags onto the ledger's four states. */
export function runStatus({
  isPending,
  isSuccess,
  isError,
}: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
}): RunStatus {
  if (isPending) return "running";
  if (isError) return "failed";
  if (isSuccess) return "succeeded";
  return "idle";
}
