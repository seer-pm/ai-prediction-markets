import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { CallBatchesInput, L2TradeProps } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import { fetchTokensBalances } from "./useTokensBalances";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { useState } from "react";
import { getL2BuyQuotes } from "@/lib/trade/getQuote";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { describeSellFailure, getQuoteTradeCalls } from "@/utils/trade";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

export function splitFromRouter(
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

export function mergeFromRouter(
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

/**
 * Builds the merge batches that undo a mint when a later phase of a strategy aborts, so a failed
 * run never strands collateral as complete sets.
 *
 * `levels` must be ordered child market first: merging a child yields its parent's outcome token,
 * which the parent level can then merge onward. Amounts come from live balances rather than the
 * minted amount, because a partially executed sell would make a full-amount merge revert.
 */
export async function getUnwindMintCalls(
  tradeExecutor: Address,
  router: Address,
  levels: { marketId: Address; tokens: Address[]; producesToken?: Address }[],
): Promise<CallBatchesInput> {
  const input: CallBatchesInput = [];
  // Tokens an earlier level will mint that aren't in the wallet yet.
  const credited: { [token: string]: bigint } = {};

  for (let i = 0; i < levels.length; i++) {
    const { marketId, tokens, producesToken } = levels[i];
    if (!tokens.length) continue;

    const balances = await fetchTokensBalances(tradeExecutor, tokens);
    if (balances.length !== tokens.length) {
      throw new Error("Cannot read token balances to unwind the mint");
    }

    const amount = minBigIntArray(
      balances.map((balance, index) => balance + (credited[tokens[index].toLowerCase()] ?? 0n)),
    );
    if (amount <= 0n) continue;

    input.push({
      calls: mergeFromRouter(router, amount, marketId, tokens),
      message: `Merging tokens back to collateral ${i + 1}/${levels.length}`,
      skipFailCalls: false,
    });

    if (producesToken) {
      const key = producesToken.toLowerCase();
      credited[key] = (credited[key] ?? 0n) + amount;
    }
  }

  return input;
}

export function redeemFromRouter(
  router: Address,
  collateralToken: Address,
  marketId: Address,
  tokens: Address[],
  outcomeIndexes: bigint[],
  amounts: bigint[],
): Execution[] {
  return [
    ...tokens.map((token, i) => ({
      to: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amounts[i]],
      }),
    })),
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "redeemPositions",
        args: [collateralToken, marketId, outcomeIndexes, amounts],
      }),
    },
  ];
}

// redeemPositions accepts arrays, so a market with many outcomes can be redeemed
// via several calls each covering a subset of outcomes. Chunk into groups of at
// most maxOutcomesPerBatch so a single batchExecute call stays under Optimism's
// 2^24 per-transaction gas cap (see OPTIMISM_MAX_TX_GAS).
export function chunkRedeemFromRouter(
  router: Address,
  collateralToken: Address,
  marketId: Address,
  tokens: Address[],
  outcomeIndexes: bigint[],
  amounts: bigint[],
  maxOutcomesPerBatch: number,
): Execution[][] {
  const batches: Execution[][] = [];
  for (let i = 0; i < tokens.length; i += maxOutcomesPerBatch) {
    batches.push(
      redeemFromRouter(
        router,
        collateralToken,
        marketId,
        tokens.slice(i, i + maxOutcomesPerBatch),
        outcomeIndexes.slice(i, i + maxOutcomesPerBatch),
        amounts.slice(i, i + maxOutcomesPerBatch),
      ),
    );
  }
  return batches;
}

// Distinct L2 markets present in the table, keyed so each market/collateral pair appears once.
const getL2Markets = (tableData: L2TradeProps["tableData"]) => {
  const l2Markets = {} as {
    [key: string]: { marketId: string; collateralToken: string };
  };
  for (const { marketId, collateralToken } of tableData) {
    l2Markets[`${marketId}-${collateralToken}`] = { marketId, collateralToken };
  }
  return Object.values(l2Markets);
};

// Kept separate from the sell batches so a sell failure can be told apart from a mint failure,
// and so the mint can be unwound on abort.
const getMintTradeExecutorCalls = ({ amount, tableData }: L2TradeProps) => {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const input: CallBatchesInput = [];
  if (parsedSplitAmount <= 0n) {
    return input;
  }
  input.push({
    calls: splitFromRouter(router, parsedSplitAmount, L2_PARENT_MARKET_ID, collateral.address),
    message: "Minting parent tokens",
  });
  // mint l2 markets
  const l2Markets = getL2Markets(tableData);
  for (let i = 0; i < l2Markets.length; i++) {
    const { marketId, collateralToken } = l2Markets[i];
    input.push({
      calls: splitFromRouter(
        router,
        parsedSplitAmount,
        marketId as Address,
        collateralToken as Address,
      ),
      message: `Minting tokens for market ${i + 1}/${l2Markets.length}`,
    });
  }
  return input;
};

const getSellTradeExecutorCalls = async ({ getQuotesResults, tradeExecutor }: L2TradeProps) => {
  const input: CallBatchesInput = [];
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
  const input: CallBatchesInput = [];
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
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const didMint = Number(amount) > 0;

  // Merge the freshly minted complete sets back to collateral so an aborted run doesn't leave the
  // wallet holding tokens it never asked for. Child markets first: merging them yields the parent
  // outcome tokens that the parent merge then converts back to collateral.
  const abortAfterMint = async (reason: string): Promise<Error> => {
    if (!didMint) {
      await withdrawFundSessionKey();
      return new Error(reason);
    }
    let unwindNote = "your minted tokens are still held, re-run the strategy with amount 0";
    try {
      onStateChange("Merging minted tokens back to collateral");
      // Same markets that were minted, but each with its complete outcome set — mergePositions
      // needs an approval for every outcome token, not just the ones we have predictions for.
      const childLevels = getL2Markets(filteredTableData).map(({ marketId, collateralToken }) => ({
        marketId: marketId as Address,
        tokens: (tableData.find((row) => isTwoStringsEqual(row.marketId, marketId))?.wrappedTokens ??
          []) as Address[],
        producesToken: collateralToken as Address,
      }));
      const unwindInput = await getUnwindMintCalls(tradeExecutor, router, [
        ...childLevels,
        {
          marketId: L2_PARENT_MARKET_ID,
          tokens: l2MarketOutcomes as Address[],
        },
      ]);
      const unwindResult = await toastifyBatchTxSessionKey(
        tradeExecutor,
        unwindInput,
        onStateChange,
        18_000_000n,
      );
      if (unwindResult.status) {
        unwindNote = `your ${amount} ${collateral.symbol} was merged back`;
      }
    } catch (e) {
      console.log("Cannot unwind mint ", e);
    }
    await withdrawFundSessionKey();
    return new Error(`${reason} No trades were made — ${unwindNote}.`);
  };

  const mintInput = getMintTradeExecutorCalls({
    amount,
    getQuotesResults,
    tradeExecutor,
    tableData: filteredTableData,
  });
  const mintResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    mintInput,
    onStateChange,
    18_000_000n,
  );
  if (!mintResult.status) {
    await withdrawFundSessionKey();
    throw mintResult.error;
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
    throw await abortAfterMint(
      `Sell phase failed: ${sellResult.error?.shortMessage ?? sellResult.error?.message ?? "unknown error"}.`,
    );
  }
  if (sellInput.length > 0 && sellResult.executedCalls === 0) {
    throw await abortAfterMint(describeSellFailure(sellResult, collateral.symbol));
  }
  onStateChange("Updating tokens balances");
  const getBuyQuotesResults = await getL2BuyQuotes({ account: tradeExecutor, amount, tableData });
  const buyInput = await getBuyTradeExecutorCalls({
    amount,
    getQuotesResults: getBuyQuotesResults,
    tradeExecutor,
    tableData: filteredTableData,
  });
  const buyResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    buyInput,
    onStateChange,
    10_000_000n,
  );
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
    // Await the balance refetches so a resubmit is validated against post-run balances.
    async onError() {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] }),
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] }),
      ]);
      queryClient.refetchQueries({ queryKey: ["useL2MarketsData"] });
      queryClient.invalidateQueries({ queryKey: ["useGetL2Quotes"] });
    },
  });
  return {
    ...mutation,
    txState,
  };
};
