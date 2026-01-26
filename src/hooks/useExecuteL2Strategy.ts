import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { L2BatchesInput, L2TradeProps } from "@/types";
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
import { getL2BuyQuotes } from "@/lib/trade/getQuote";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

function splitFromRouter(
  router: Address,
  amount: bigint,
  marketId: Address,
  token: Address,
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
  tokens: Address[],
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

const getSellTradeExecutorCalls = async ({
  amount,
  getQuotesResults,
  tradeExecutor,
  tableData,
}: L2TradeProps) => {
  // mint l1
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const input: L2BatchesInput = [];
  input.push({
    calls: splitFromRouter(router, parsedSplitAmount, L2_PARENT_MARKET_ID, collateral.address),
    message: "Minting parent tokens",
  });

  // mint l2 markets
  const l2Markets = {} as {
    [key: string]: { marketId: string; collateralToken: string };
  };
  for (const { marketId, collateralToken } of tableData) {
    l2Markets[`${marketId}-${collateralToken}`] = { marketId, collateralToken };
  }
  for (let i = 0; i < Object.values(l2Markets).length; i++) {
    const { marketId, collateralToken } = Object.values(l2Markets)[i];
    input.push({
      calls: splitFromRouter(
        router,
        parsedSplitAmount,
        marketId as Address,
        collateralToken as Address,
      ),
      message: `Minting tokens for market ${i + 1}/${Object.values(l2Markets).length}`,
    });
  }

  const calls: Execution[] = [];
  //trade transactions
  for (const { quotes } of getQuotesResults) {
    const sellQuotes = quotes.filter((quote) => quote.swapType === "sell");
    if (!sellQuotes.length) continue;
    // push sell trade transactions
    calls.push(...getQuoteTradeCalls(tradeExecutor, sellQuotes));
  }
  // split trade calls into batches of 100
  for (let i = 0; i < calls.length; i += 100) {
    input.push({
      calls: calls.slice(i, i + 100),
      message: `Selling overvalued tokens batch ${i / 100 + 1}/${Math.ceil(calls.length / 100)}`,
      skipFailCalls: true,
    });
  }
  return input;
};

const getBuyTradeExecutorCalls = async ({
  amount: _,
  getQuotesResults,
  tradeExecutor,
  tableData,
}: L2TradeProps) => {
  // mint l1
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const input: L2BatchesInput = [];
  const mergeCalls: Execution[] = [];
  const buyCalls: Execution[] = [];
  //trade transactions
  for (const { quotes, mergeAmount } of getQuotesResults) {
    const buyQuotes = quotes.filter((quote) => quote.swapType === "buy");
    if (!buyQuotes.length) continue;
    // push merge
    if (mergeAmount > 0n) {
      const outcomeId = buyQuotes[0].buyToken;
      const row = tableData.find((row) => isTwoStringsEqual(row.outcomeId, outcomeId));
      if (!row) continue;
      mergeCalls.push(
        ...mergeFromRouter(router, mergeAmount, row.marketId as Address, row.wrappedTokens),
      );
    }
    //push buy trade
    buyCalls.push(...getQuoteTradeCalls(tradeExecutor, buyQuotes));
  }
  // split trade calls into batches of 100
  for (let i = 0; i < mergeCalls.length; i += 100) {
    input.push({
      calls: mergeCalls.slice(i, i + 100),
      message: `Merging tokens batch ${i / 100 + 1}/${Math.ceil(mergeCalls.length / 100)}`,
      skipFailCalls: false,
    });
  }
  for (let i = 0; i < buyCalls.length; i += 100) {
    input.push({
      calls: buyCalls.slice(i, i + 100),
      message: `Buying undervalued tokens batch ${i / 100 + 1}/${Math.ceil(buyCalls.length / 100)}`,
      skipFailCalls: true,
    });
  }
  return input;
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
  const sellInput = await getSellTradeExecutorCalls({
    amount,
    getQuotesResults,
    tradeExecutor,
    tableData: filteredTableData,
  });
  const sellResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    sellInput,
    onStateChange,
    18_000_000n,
  );
  if (!sellResult.status) {
    await withdrawFundSessionKey();
    throw sellResult.error;
  }
  onStateChange("Updating tokens balances");
  const getBuyQuotesResults = await getL2BuyQuotes({ account: tradeExecutor, amount, tableData });
  const buyInput = await getBuyTradeExecutorCalls({
    amount,
    getQuotesResults: getBuyQuotesResults,
    tradeExecutor,
    tableData: filteredTableData,
  });
  const buyResult = await toastifyBatchTxSessionKey(tradeExecutor, buyInput, onStateChange, 0n);
  if (!buyResult.status) {
    await withdrawFundSessionKey();
    throw buyResult.error;
  }
  await withdrawFundSessionKey();
  toastSuccess({
    title: "Trade executed",
  });
  return buyResult;
};

export const useExecuteL2Strategy = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (tradeProps: L2TradeProps) =>
      executeL2StrategyContract({
        ...tradeProps,
        onStateChange: (state) => {
          setTxState(state);
          console.log(state);
        },
      }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useL2MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetL2Quotes"] });
      }, 3000);
    },
    onError() {
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
