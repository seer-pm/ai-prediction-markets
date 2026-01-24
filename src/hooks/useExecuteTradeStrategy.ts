import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getApprovals7702 } from "@/lib/trade/getApprovals7702";
import { TradeProps, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L1_MARKET_ID,
  OTHER_MARKET_ID,
  OTHER_TOKEN_ID,
  ROUTER_ADDRESSES,
  UNISWAP_ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { toastifyBatchTx } from "@/lib/toastify";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

function splitFromRouter(router: Address, amount: bigint, marketId: Address): Execution {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "splitPosition",
      args: [collateral.address, marketId, amount],
    }),
  };
}

function mergeFromRouter(router: Address, amount: bigint, marketId: Address): Execution {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "mergePositions",
      args: [collateral.address, marketId, amount],
    }),
  };
}

const checkAndAddApproveCalls = async ({
  tradeExecutor,
  amount,
  getQuotesResult,
  tableData,
}: TradeProps) => {
  const { quotes, mergeAmount, otherTokensFromMergeOther } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const [buyQuotes, sellQuotes] = quotes.reduce(
    (acc, quote) => {
      acc[isTwoStringsEqual(quote.sellToken, collateral.address) ? 0 : 1].push(quote);
      return acc;
    },
    [[], []] as [UniswapQuoteTradeResult[], UniswapQuoteTradeResult[]]
  );
  // split (main + other) + sell + merge + buy approval calls
  const calls: Execution[] = [
    ...(Number(amount) > 0
      ? [
          {
            tokensAddresses: [collateral.address],
            account: tradeExecutor,
            spender: router,
            amounts: parseUnits(amount, collateral.decimals),
            chainId: CHAIN_ID,
          },
          {
            tokensAddresses: [OTHER_TOKEN_ID as Address],
            account: tradeExecutor,
            spender: router,
            amounts: parseUnits(amount, 18),
            chainId: CHAIN_ID,
          },
        ]
      : []),
    ...sellQuotes.map((quote) => ({
      tokensAddresses: [quote.sellToken],
      account: tradeExecutor,
      spender: UNISWAP_ROUTER_ADDRESSES[CHAIN_ID],
      amounts: BigInt(quote.sellAmount),
      chainId: CHAIN_ID,
    })),
    ...(otherTokensFromMergeOther > 0n
      ? tableData
          .filter((row) => row.isOther)
          .map((row) => ({
            tokensAddresses: [row.outcomeId as Address],
            account: tradeExecutor,
            spender: router,
            amounts: otherTokensFromMergeOther,
            chainId: CHAIN_ID,
          }))
      : []),
    ...(mergeAmount > 0n
      ? tableData
          .filter((row) => !row.isOther)
          .map((row) => ({
            tokensAddresses: [row.outcomeId as Address],
            account: tradeExecutor,
            spender: router,
            amounts: mergeAmount,
            chainId: CHAIN_ID,
          }))
      : []),
    ...buyQuotes.map((quote) => ({
      tokensAddresses: [quote.sellToken],
      account: tradeExecutor,
      spender: UNISWAP_ROUTER_ADDRESSES[CHAIN_ID],
      amounts: BigInt(quote.sellAmount),
      chainId: CHAIN_ID,
    })),
  ]
    .map((request) => getApprovals7702(request))
    .flat();

  return calls;
};

const getTradeExecutorCalls = async ({
  amount,
  getQuotesResult,
  tradeExecutor,
  tableData,
}: TradeProps) => {
  const { mergeAmount, otherTokensFromMergeOther } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const calls: Execution[] = [];
  const approveCalls = await checkAndAddApproveCalls({
    amount,
    getQuotesResult,
    tradeExecutor,
    tableData,
  });
  calls.push(...approveCalls);
  if (Number(amount) > 0) {
    calls.push(splitFromRouter(router, parsedSplitAmount, L1_MARKET_ID));
    calls.push(splitFromRouter(router, parsedSplitAmount, OTHER_MARKET_ID));
  }
  // push sell trade transactions
  const sellTradeTransactions = getQuotesResult!.quotes
    .filter((quote) => quote.swapType === "sell")
    .map((quote) => getUniswapTradeExecution(quote, tradeExecutor));
  calls.push(...sellTradeTransactions);
  console.log({result: getQuotesResult?.quotes, otherTokensFromMergeOther, mergeAmount})

  // push merge
  if (otherTokensFromMergeOther > 0n) {
    calls.push(mergeFromRouter(router, otherTokensFromMergeOther, OTHER_MARKET_ID));
  }
  if (mergeAmount > 0n) {
    calls.push(mergeFromRouter(router, mergeAmount, L1_MARKET_ID));
  }

  // push buy trade transactions
  const buyTradeTransactions = getQuotesResult!.quotes
    .filter((quote) => quote.swapType === "buy")
    .map((quote) => getUniswapTradeExecution(quote, tradeExecutor));
  calls.push(...buyTradeTransactions);
  return calls;
};

const executeTradeStrategyContract = async ({
  amount,
  getQuotesResult,
  tradeExecutor,
  tableData,
}: TradeProps) => {
  if (!getQuotesResult?.quotes || !getQuotesResult.quotes.length) {
    throw new Error("No quote found");
  }
  if (!tableData.length) {
    throw new Error("No token found");
  }
  const tradeExecutorCalls = await getTradeExecutorCalls({
    amount,
    getQuotesResult,
    tradeExecutor,
    tableData,
  });

  const result = await toastifyBatchTx(tradeExecutor, tradeExecutorCalls, {
    txSent: "Executing trade...",
    txSuccess: "Trade executed!",
  });
  if (!result.status) {
    throw result.error;
  }

  if (!result.status) {
    throw result.error;
  }
  return result;
};

export const useExecuteTradeStrategy = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (tradeProps: TradeProps) => executeTradeStrategyContract(tradeProps),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useL1MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetQuotes"] });
      }, 3000);
    },
  });
};
