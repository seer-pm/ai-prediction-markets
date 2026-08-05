import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getOctantBuyQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, TableData, TxStateChange, UniswapQuoteTradeResult } from "@/types";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  OCTANT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { describeSellFailure, getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { getUnwindMintCalls, mergeFromRouter, splitFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalancesOrThrow } from "./useTokensBalances";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

type OctantTradeProps = {
  tradeExecutor: Address;
  amount: string;
  getQuotesResult: { quotes: UniswapQuoteTradeResult[]; mergeAmount: bigint } | undefined;
  tableData: TableData[];
};

const getSellTradeExecutorCalls = async ({ getQuotesResult, tradeExecutor }: OctantTradeProps) => {
  const input: CallBatchesInput = [];
  // push sell trade transactions
  const sellCalls = getQuoteTradeCalls(
    tradeExecutor,
    getQuotesResult!.quotes.filter((quote) => quote.swapType === "sell"),
  );

  for (let i = 0; i < sellCalls.length; i += 100) {
    input.push({
      calls: sellCalls.slice(i, i + 100),
      message: "Selling outcomes priced above your prediction",
      phase: "sell",
      step: i / 100 + 1,
      of: Math.ceil(sellCalls.length / 100),
      skipFailCalls: true,
    });
  }
  return input;
};

const getBuyTradeExecutorCalls = async ({
  getQuotesResult,
  tradeExecutor,
  tableData,
}: OctantTradeProps) => {
  const { mergeAmount } = getQuotesResult!;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const input: CallBatchesInput = [];

  // push merge (single market)
  if (mergeAmount > 0n) {
    input.push({
      calls: mergeFromRouter(
        router,
        mergeAmount,
        OCTANT_MARKET_ID,
        tableData.map((row) => row.outcomeId as Address),
      ),
      message: "Merging complete sets back to collateral",
      phase: "merge",
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
      message: "Buying outcomes priced below your prediction",
      phase: "buy",
      step: i / 100 + 1,
      of: Math.ceil(buyCalls.length / 100),
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
}: OctantTradeProps & { onStateChange: TxStateChange }) => {
  if (!getQuotesResult?.quotes || !getQuotesResult.quotes.length) {
    throw new Error("No quote found");
  }
  if (!tableData.length) {
    throw new Error("No token found");
  }
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const didMint = Number(amount) > 0;

  // Merge the freshly minted complete sets back to collateral so an aborted run doesn't leave the
  // wallet holding tokens it never asked for.
  const abortAfterMint = async (reason: string): Promise<Error> => {
    if (!didMint) {
      await withdrawFundSessionKey();
      return new Error(reason);
    }
    let unwindNote = "your minted tokens are still held, re-run the strategy with amount 0";
    try {
      onStateChange({ phase: "unwind", label: "Returning your minted tokens to collateral" });
      const unwindInput = await getUnwindMintCalls(tradeExecutor, router, [
        {
          marketId: OCTANT_MARKET_ID,
          tokens: tableData.map((row) => row.outcomeId as Address),
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
    calls.push(...splitFromRouter(router, parsedSplitAmount, OCTANT_MARKET_ID, collateral.address));
  }
  const mintInput: CallBatchesInput = [];
  if (calls.length) {
    mintInput.push({
      calls,
      message: "Minting complete sets",
      phase: "mint",
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
  onStateChange({ phase: "requote", label: "Re-reading balances and refreshing quotes" });
  const [balanceAfter] = await fetchTokensBalancesOrThrow(tradeExecutor, [collateral.address]);
  if (balanceAfter - balanceBefore === 0n) {
    throw await abortAfterMint(describeSellFailure(sellResult, collateral.symbol));
  }
  console.log({ balanceAfter, balanceBefore });
  const getBuyQuotesResults = await getOctantBuyQuotes({
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
  toastSuccess({ title: "Strategy executed" });
  return buyResult;
};

export const useExecuteOctantTradeStrategy = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (tradeProps: OctantTradeProps) =>
      executeTradeStrategyContract({
        ...tradeProps,
        onStateChange: progress.onStateChange,
      }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useOctantMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOctantQuotes"] });
      }, 3000);
    },
    // Await the balance refetches so a resubmit is validated against post-run balances.
    async onError() {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] }),
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] }),
      ]);
      queryClient.refetchQueries({ queryKey: ["useOctantMarketsData"] });
      queryClient.invalidateQueries({ queryKey: ["useGetOctantQuotes"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
