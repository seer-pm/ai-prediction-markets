import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { L2TradeProps } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { getQuoteTradeCalls } from "./useExecuteOriginalityStrategy";
import { useState } from "react";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

function splitFromRouter(
  router: Address,
  amount: bigint,
  marketId: Address,
  token: Address
): Execution[] {
  return [
    {
      to: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amount],
      }),
    },
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "splitPosition",
        args: [collateral.address, marketId, amount],
      }),
    },
  ];
}

function mergeFromRouter(
  router: Address,
  amount: bigint,
  marketId: Address,
  tokens: Address[]
): Execution[] {
  return [
    ...tokens.map((token) => {
      return {
        to: token,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [router, amount],
        }),
      };
    }),
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "mergePositions",
        args: [collateral.address, marketId, amount],
      }),
    },
  ];
}

const getTradeExecutorCalls = async ({
  amount,
  getQuotesResults,
  tradeExecutor,
  tableData,
}: L2TradeProps) => {
  // mint l1
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const batchesOfCalls: Execution[][] = [];
  const messages: string[] = [];
  batchesOfCalls.push(
    splitFromRouter(router, parsedSplitAmount, L2_PARENT_MARKET_ID, collateral.address)
  );
  messages.push("Minting parent tokens");
  // mint l2 markets
  const l2Markets = {} as {
    [key: string]: { marketId: string; collateralToken: string };
  };
  for (const { marketId, collateralToken } of tableData) {
    l2Markets[`${marketId}-${collateralToken}`] = { marketId, collateralToken };
  }
  for (let i = 0; i < Object.values(l2Markets).length; i++) {
    const { marketId, collateralToken } = Object.values(l2Markets)[i];
    batchesOfCalls.push(
      splitFromRouter(router, parsedSplitAmount, marketId as Address, collateralToken as Address)
    );
    messages.push(`Minting tokens for market ${i + 1}/${Object.values(l2Markets).length}`);
  }

  const calls: Execution[] = [];
  //trade transactions
  for (const { quotes, mergeAmount } of getQuotesResults) {
    const sellQuotes = quotes.filter((quote) => quote.swapType === "sell");
    const buyQuotes = quotes.filter((quote) => quote.swapType === "buy");
    if (!sellQuotes.length || !buyQuotes.length) continue;
    // push sell trade transactions
    calls.push(...(await getQuoteTradeCalls(tradeExecutor, sellQuotes)));
    // push merge
    if (mergeAmount > 0n) {
      const outcomeId = sellQuotes[0].sellToken;
      const row = tableData.find((row) => isTwoStringsEqual(row.outcomeId, outcomeId));
      if (!row) continue;
      calls.push(
        ...mergeFromRouter(router, mergeAmount, row.marketId as Address, row.wrappedTokens)
      );
    }
    //push buy trade
    calls.push(...(await getQuoteTradeCalls(tradeExecutor, buyQuotes)));
  }
  // split trade calls into batches of 100
  for (let i = 0; i < calls.length; i += 100) {
    batchesOfCalls.push(calls.slice(i, i + 100));
    messages.push(`Swapping tokens batch ${i / 100 + 1}/${Math.ceil(calls.length / 100)}`);
  }
  return {batchesOfCalls, messages};
};

const executeL2StrategyContract = async ({
  amount,
  getQuotesResults,
  tradeExecutor,
  tableData,
  onStateChange,
}: L2TradeProps & { onStateChange: (state: string) => void }) => {
  const filteredTableData = tableData.filter((row) => row.hasPrediction && row.difference);
  if (!getQuotesResults.length) {
    throw new Error("No quote found");
  }
  if (!filteredTableData.length) {
    throw new Error("No token found");
  }
  const tradeExecutorCalls = await getTradeExecutorCalls({
    amount,
    getQuotesResults,
    tradeExecutor,
    tableData: filteredTableData,
  });
  const result = await toastifyBatchTxSessionKey(
    tradeExecutor,
    tradeExecutorCalls.batchesOfCalls,
    tradeExecutorCalls.messages,
    onStateChange
  );
  if (!result.status) {
    throw result.error;
  }

  return result;
};

export const useExecuteL2Strategy = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("Hello world");
  const mutation = useMutation({
    mutationFn: (tradeProps: L2TradeProps) =>
      executeL2StrategyContract({ ...tradeProps, onStateChange: setTxState }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useL2MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetL2Quotes"] });
      }, 3000);
    },
  });
  return {
    ...mutation,
    txState,
  };
};
