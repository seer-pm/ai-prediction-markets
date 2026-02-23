import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getTradeApprovals7702 } from "@/lib/trade/getApprovals7702";
import { UniswapQuoteTradeResult } from "@/types";
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
