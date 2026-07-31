import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getL1BuyQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, TradeProps } from "@/types";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L1_MARKET_ID,
  OTHER_MARKET_ID,
  OTHER_TOKEN_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { describeSellFailure, getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { getUnwindMintCalls, mergeFromRouter, splitFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalancesOrThrow } from "./useTokensBalances";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

const getSellTradeExecutorCalls = async ({
  amount: _,
  getQuotesResult,
  tradeExecutor,
}: TradeProps) => {
  const input: CallBatchesInput = [];
  // push sell trade transactions
  const sellCalls = getQuoteTradeCalls(
    tradeExecutor,
    getQuotesResult!.quotes.filter((quote) => quote.swapType === "sell"),
  );

  for (let i = 0; i < sellCalls.length; i += 100) {
    input.push({
      calls: sellCalls.slice(i, i + 100),
      message: `Selling overvalued tokens batch ${i / 100 + 1}/${Math.ceil(sellCalls.length / 100)}`,
      skipFailCalls: true,
    });
  }
  return input;
};

const getBuyTradeExecutorCalls = async ({
  getQuotesResult,
  tradeExecutor,
  tableData,
}: TradeProps) => {
  const { mergeAmount, otherTokensFromMergeOther } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const input: CallBatchesInput = [];

  // push merge
  if (otherTokensFromMergeOther > 0n) {
    input.push({
      calls: mergeFromRouter(
        router,
        otherTokensFromMergeOther,
        OTHER_MARKET_ID,
        tableData.filter((row) => row.isOther).map((row) => row.outcomeId as Address),
      ),
      message: "Merging tokens",
    });
  }
  if (mergeAmount > 0n) {
    input.push({
      calls: mergeFromRouter(
        router,
        mergeAmount,
        L1_MARKET_ID,
        tableData.filter((row) => !row.isOther).map((row) => row.outcomeId as Address),
      ),
      message: "Merging tokens",
    });
  }

  // push buy trade transactions
  const buyCalls = getQuoteTradeCalls(
    tradeExecutor,
    getQuotesResult!.quotes.filter((quote) => quote.swapType === "buy"),
  );
  for (let i = 0; i < buyCalls.length; i += 100) {
    input.push({
      calls: buyCalls.slice(i, i + 100),
      message: `Buying undervalued tokens batch ${i / 100 + 1}/${Math.ceil(buyCalls.length / 100)}`,
      skipFailCalls: true,
    });
  }
  return input;
};

const executeTradeStrategyContract = async ({
  amount,
  getQuotesResult,
  tradeExecutor,
  tableData,
  onStateChange,
}: TradeProps & { onStateChange: (state: string) => void }) => {
  if (!getQuotesResult?.quotes || !getQuotesResult.quotes.length) {
    throw new Error("No quote found");
  }
  if (!tableData.length) {
    throw new Error("No token found");
  }
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const didMint = Number(amount) > 0;

  // Merges the freshly minted complete sets back to collateral so an aborted run doesn't leave
  // the wallet holding tokens it never asked for. Child market first: merging it yields the
  // parent's "Other" outcome token, which the parent merge then converts back to collateral.
  const abortAfterMint = async (reason: string): Promise<Error> => {
    if (!didMint) {
      await withdrawFundSessionKey();
      return new Error(reason);
    }
    let unwindNote = "your minted tokens are still held, re-run the strategy with amount 0";
    try {
      onStateChange("Merging minted tokens back to collateral");
      const unwindInput = await getUnwindMintCalls(tradeExecutor, router, [
        {
          marketId: OTHER_MARKET_ID,
          tokens: tableData.filter((row) => row.isOther).map((row) => row.outcomeId as Address),
          producesToken: OTHER_TOKEN_ID,
        },
        {
          marketId: L1_MARKET_ID,
          tokens: tableData.filter((row) => !row.isOther).map((row) => row.outcomeId as Address),
        },
      ]);
      const unwindResult = await toastifyBatchTxSessionKey(
        tradeExecutor,
        unwindInput,
        onStateChange,
        30_000_000n,
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

  const calls: Execution[] = [];
  if (didMint) {
    calls.push(...splitFromRouter(router, parsedSplitAmount, L1_MARKET_ID, collateral.address));
    calls.push(...splitFromRouter(router, parsedSplitAmount, OTHER_MARKET_ID, OTHER_TOKEN_ID));
  }
  const mintInput: CallBatchesInput = [];
  if (calls.length) {
    mintInput.push({
      calls,
      message: "Minting tokens",
    });
  }
  const mintResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    mintInput,
    onStateChange,
    50_000_000n,
  );
  if (!mintResult.status) {
    await withdrawFundSessionKey();
    throw mintResult.error;
  }
  const [balanceBefore] = await fetchTokensBalancesOrThrow(tradeExecutor, [collateral.address]);
  const sellInput = await getSellTradeExecutorCalls({
    amount,
    getQuotesResult,
    tradeExecutor,
    tableData,
  });
  const sellResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    sellInput,
    onStateChange,
    30_000_000n,
  );
  if (!sellResult.status) {
    throw await abortAfterMint(
      `Sell phase failed: ${sellResult.error?.shortMessage ?? sellResult.error?.message ?? "unknown error"}.`,
    );
  }
  onStateChange("Updating tokens balances");
  const [balanceAfter] = await fetchTokensBalancesOrThrow(tradeExecutor, [collateral.address]);
  if (balanceAfter - balanceBefore === 0n) {
    throw await abortAfterMint(describeSellFailure(sellResult, collateral.symbol));
  }
  console.log({ balanceAfter, balanceBefore });
  const getBuyQuotesResults = await getL1BuyQuotes({
    account: tradeExecutor,
    amount,
    tableData,
    collateralFromSell: balanceAfter - balanceBefore,
  });
  const buyInput = await getBuyTradeExecutorCalls({
    amount,
    getQuotesResult: getBuyQuotesResults,
    tradeExecutor,
    tableData,
  });
  const buyResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    buyInput,
    onStateChange,
    15_000_000n,
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

export const useExecuteTradeStrategy = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (tradeProps: TradeProps) =>
      executeTradeStrategyContract({
        ...tradeProps,
        onStateChange: (state) => {
          setTxState(state);
          console.log(state);
        },
      }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useL1MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetQuotes"] });
      }, 3000);
    },
    // Await the balance refetches rather than firing them on a timer: a failed run leaves the
    // modal showing pre-run balances, and resubmitting against those is what makes the retry
    // revert on-chain instead of being caught by the "Not enough balance" validator.
    async onError() {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] }),
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] }),
      ]);
      queryClient.refetchQueries({ queryKey: ["useL1MarketsData"] });
      queryClient.invalidateQueries({ queryKey: ["useGetQuotes"] });
    },
  });
  return {
    ...mutation,
    txState,
  };
};
