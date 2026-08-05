import type { TxPhase } from "@/types";

/** What each stage is called in the run ledger. */
export const TX_PHASE_LABELS: Record<TxPhase, string> = {
  authorize: "Authorise the run",
  mint: "Mint complete sets",
  sell: "Sell overvalued outcomes",
  requote: "Refresh quotes",
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

export const SELL_ALL_PHASES: TxPhase[] = ["authorize", "sell", "merge", "settle"];

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
