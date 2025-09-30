import { RouterAbi } from "@/abis/RouterAbi";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getApprovals7702, getMaximumAmountIn } from "@/lib/trade/getApprovals7702";
import { TradeProps, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  AI_PREDICTION_MARKET_ID,
  CHAIN_ID,
  COLLATERAL_TOKENS,
  ROUTER_ADDRESSES,
  SupportedChain,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { writeContract } from "@wagmi/core";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

function splitFromRouter(router: Address, amount: bigint): Execution {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "splitPosition",
      args: [collateral.address, AI_PREDICTION_MARKET_ID, amount],
    }),
  };
}

function mergeFromRouter(router: Address, amount: bigint): Execution {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "mergePositions",
      args: [collateral.address, AI_PREDICTION_MARKET_ID, amount],
    }),
  };
}

const checkAndAddApproveCalls = async ({
  tradeExecutor,
  amount,
  getQuotesResult,
  wrappedTokens,
}: TradeProps) => {
  const { quotes, mergeAmount } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const [buyQuotes, sellQuotes] = quotes.reduce(
    (acc, quote) => {
      acc[isTwoStringsEqual(quote.sellToken, collateral.address) ? 0 : 1].push(quote);
      return acc;
    },
    [[], []] as [UniswapQuoteTradeResult[], UniswapQuoteTradeResult[]]
  );
  // split + sell + merge + buy approval calls
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
        ]
      : []),
    ...sellQuotes.map(({ trade }) => ({
      tokensAddresses: [trade.executionPrice.baseCurrency.address as `0x${string}`],
      account: tradeExecutor,
      spender: trade.approveAddress as `0x${string}`,
      amounts: getMaximumAmountIn(trade),
      chainId: trade.chainId as SupportedChain,
    })),
    ...(mergeAmount > 0n
      ? wrappedTokens.map((token) => ({
          tokensAddresses: [token],
          account: tradeExecutor,
          spender: router,
          amounts: mergeAmount,
          chainId: CHAIN_ID,
        }))
      : []),
    {
      tokensAddresses: [buyQuotes[0].trade.executionPrice.baseCurrency.address as `0x${string}`],
      account: tradeExecutor,
      spender: buyQuotes[0].trade.approveAddress as `0x${string}`,
      amounts: buyQuotes.reduce((acc, curr) => acc + getMaximumAmountIn(curr.trade), 0n),
      chainId: CHAIN_ID,
    },
  ]
    .map((request) => getApprovals7702(request))
    .flat();

  return calls;
};

const getTradeExecutorCalls = async ({
  amount,
  getQuotesResult,
  tradeExecutor,
  wrappedTokens,
}: TradeProps) => {
  const { mergeAmount } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const calls: Execution[] = [];
  const approveCalls = await checkAndAddApproveCalls({
    amount,
    getQuotesResult,
    tradeExecutor,
    wrappedTokens,
  });
  calls.push(...approveCalls);
  if (Number(amount) > 0) {
    calls.push(splitFromRouter(router, parsedSplitAmount));
  }
  // push sell trade transactions
  const sellTradeTransactions = await Promise.all(
    getQuotesResult!.quotes
      .filter((quote) => quote.swapType === "sell")
      .map(({ trade }) => getUniswapTradeExecution(trade, tradeExecutor))
  );
  calls.push(...sellTradeTransactions);

  // push merge
  if (mergeAmount > 0n) {
    calls.push(mergeFromRouter(router, mergeAmount));
  }

  // push buy trade transactions
  const buyTradeTransactions = await Promise.all(
    getQuotesResult!.quotes
      .filter((quote) => quote.swapType === "buy")
      .map(({ trade }) => getUniswapTradeExecution(trade, tradeExecutor))
  );
  calls.push(...buyTradeTransactions);
  return calls;
};

const executeTradeStrategyContract = async ({
  amount,
  getQuotesResult,
  tradeExecutor,
  wrappedTokens,
}: TradeProps) => {
  if (!getQuotesResult?.quotes || !getQuotesResult.quotes.length) {
    throw new Error("No quote found");
  }
  if (!wrappedTokens.length) {
    throw new Error("No token found");
  }
  const tradeExecutorCalls = await getTradeExecutorCalls({
    amount,
    getQuotesResult,
    tradeExecutor,
    wrappedTokens,
  });

  const writePromise = writeContract(config, {
    address: tradeExecutor,
    abi: TradeExecutorAbi,
    functionName: "batchExecute",
    args: [tradeExecutorCalls.map((call) => ({ data: call.data, to: call.to }))],
    value: 0n,
    chainId: CHAIN_ID,
  });

  const result = await toastifyTx(() => writePromise, {
    txSent: { title: "Executing trade..." },
    txSuccess: { title: "Trade executed!" },
  });
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
        queryClient.refetchQueries({ queryKey: ["useMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetQuotes"] });
      }, 3000);
    },
  });
};
