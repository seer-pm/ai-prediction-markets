import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getTradeApprovals7702 } from "@/lib/trade/getApprovals7702";
import { BatchTxResult, UniswapQuoteTradeResult } from "@/types";
import { Address } from "viem";

export const getQuoteTradeCalls = (tradeExecutor: Address, quotes: UniswapQuoteTradeResult[]) => {
  const calls = quotes
    .map((quote) => {
      return [
        ...getTradeApprovals7702(tradeExecutor, quote),
        getUniswapTradeExecution(quote, tradeExecutor),
      ];
    })
    .flat();
  return calls;
};

/**
 * Explains why a sell phase produced no collateral. The old code only measured the collateral
 * delta, so a batch that never reached the chain was reported as "cannot sell overvalued tokens",
 * which blamed the market for what was usually a dropped transaction.
 */
export const describeSellFailure = (
  result: BatchTxResult & { status: true },
  collateralSymbol: string,
) => {
  if (result.executedCalls === 0 && result.prunedCalls === 0) {
    return "Sell phase never ran: no sell orders were submitted.";
  }
  if (result.executedCalls === 0) {
    return `Sell phase did not execute: all ${result.prunedCalls} sell calls reverted in simulation (stale quotes or insufficient token balance).`;
  }
  return `Sell orders executed but produced no ${collateralSymbol}${
    result.prunedCalls > 0 ? ` (${result.prunedCalls} of the calls were dropped)` : ""
  }.`;
};
