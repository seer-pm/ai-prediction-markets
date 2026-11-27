import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey, withRunLock } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import {
  getSellFromBalanceZcashQuotes,
  getZcashQuotes,
  ZCASH_QUOTE_ATTEMPTS,
  type ZcashQuoteFailure,
} from "@/lib/trade/getZcashQuote";
import { allocateZcashBudget, getZcashMinMint } from "@/utils/zcashBudget";
import {
  BatchTxResult,
  CallBatchesInput,
  TxStateChange,
  ZcashQuoteResult,
  ZcashTradeProps,
} from "@/types";
import { CHAIN_ID, collateral, DECIMALS, ROUTER_ADDRESSES, VOLUME_MIN } from "@/utils/constants";
import { noTradeError, TradeError } from "@/utils/errors";
import { safeParseUnits } from "@/utils/format";
import { getQuoteTradeCalls } from "@/utils/trade";
import { NO_INDEX, YES_INDEX } from "@/utils/zcashMarkets";
import { useMutation } from "@tanstack/react-query";
import { Address, formatUnits } from "viem";
import { splitFromRouter } from "./useExecuteL2Strategy";
import { useTxProgress } from "./useTxProgress";

const BATCH_SIZE = 100;

/**
 * Build the calls for one run.
 *
 * The split is emitted **per market**. There is no single global mint the way Round 1, L1 and
 * Octant do it: those contests have one market (or one parent) whose complete set covers every
 * outcome, whereas each Zcash market is its own top-level market collateralized in sUSDS. Minting
 * in one does nothing for the other 36.
 */
const getTradeExecutorCalls = ({
  quoteResults,
  tradeExecutor,
}: {
  tradeExecutor: Address;
  quoteResults: ZcashQuoteResult[];
}) => {
  const router = ROUTER_ADDRESSES[CHAIN_ID];

  return quoteResults
    .map(({ quotes, row, mintAmount }) => {
      const tradeCalls = getQuoteTradeCalls(tradeExecutor, quotes);
      const mintValue = safeParseUnits(mintAmount ?? "0", DECIMALS);
      // Skip a wasted splitPosition(0) on branches that only buy, or that sell purely from balance.
      if (mintValue <= 0n) {
        return tradeCalls;
      }
      return [
        ...splitFromRouter(router, mintValue, row.marketId as Address, row.collateralToken),
        ...tradeCalls,
      ];
    })
    .flat();
};

const executeZcashStrategy = async ({
  amount,
  tableData,
  tradeExecutor,
  onStateChange,
}: ZcashTradeProps & { onStateChange: TxStateChange }) => {
  if (!tableData?.length) {
    throw new Error("No prediction data");
  }

  // 1. Turn inventory already held on an overvalued side into sUSDS, so the main pass has more to
  //    spend than the mint amount alone. Executed on its own so the proceeds are real before the
  //    budget is divided.
  const { quotes: sellFromBalanceQuotes, failed: presaleFailed } =
    await getSellFromBalanceZcashQuotes({
      account: tradeExecutor,
      tableData,
    });
  let prunedCalls = 0;

  const sellTokenMapping = sellFromBalanceQuotes.reduce(
    (acc, result) => {
      acc[result.sellToken.toLowerCase()] = {
        sellAmount: BigInt(result.sellAmount),
        value: BigInt(result.value),
      };
      return acc;
    },
    {} as { [key: string]: { sellAmount: bigint; value: bigint } },
  );

  if (sellFromBalanceQuotes.length) {
    const sellFromBalanceCalls = getQuoteTradeCalls(tradeExecutor, sellFromBalanceQuotes);
    const sellInput: CallBatchesInput = [];
    for (let i = 0; i < sellFromBalanceCalls.length; i += BATCH_SIZE) {
      sellInput.push({
        calls: sellFromBalanceCalls.slice(i, i + BATCH_SIZE),
        message: `Selling overvalued tokens from balance batch ${i / BATCH_SIZE + 1}/${Math.ceil(sellFromBalanceCalls.length / BATCH_SIZE)}`,
        phase: "sell",
        skipFailCalls: true,
      });
    }
    const sellResult = await toastifyBatchTxSessionKey(
      tradeExecutor,
      sellInput,
      onStateChange,
      sellInput.length === 1 ? 30_000_000n : 15_000_000n,
    );
    if (!sellResult.status) {
      await withdrawFundSessionKey();
      throw sellResult.error;
    }
    prunedCalls += sellResult.prunedCalls;
  }

  // 2. Fold the pre-sale into each row: the tokens are gone and the pools have already moved, so
  //    the remaining headroom shrinks by exactly what was sold.
  const proceedsByMarket: { [marketId: string]: bigint } = {};
  const settledTableData = tableData.map((initialRow) => {
    const row = { ...initialRow };
    for (const index of [YES_INDEX, NO_INDEX]) {
      const token = row.wrappedTokens[index]?.toLowerCase();
      const data = token ? sellTokenMapping[token] : undefined;
      if (!data) continue;

      const sold = Number(formatUnits(data.sellAmount, DECIMALS));
      if (index === YES_INDEX) {
        row.volumeUntilYesPrice = Math.max(0, row.volumeUntilYesPrice - sold);
        row.yesBalance = row.yesBalance ? row.yesBalance - data.sellAmount : row.yesBalance;
      } else {
        row.volumeUntilNoPrice = Math.max(0, row.volumeUntilNoPrice - sold);
        row.noBalance = row.noBalance ? row.noBalance - data.sellAmount : row.noBalance;
      }
      proceedsByMarket[row.marketId] = (proceedsByMarket[row.marketId] ?? 0n) + data.value;
    }
    return row;
  });

  // 3. Divide the mint amount equally across the markets the user predicted and that still have a
  //    move to make. Each row's own pre-sale proceeds are added on top of its slice.
  const newTableData = allocateZcashBudget({
    tableData: settledTableData,
    amount,
    proceedsByMarket,
  });

  const { results: zcashQuoteResults, failed } = await getZcashQuotes({
    account: tradeExecutor,
    tableData: newTableData,
  });
  const skippedMarkets = skippedMarketNames([...presaleFailed, ...failed]);
  // Nothing to trade: say whether the amount was too small to split, rather than "No quote found".
  const nothingToTrade = () =>
    noTradeError({
      amount,
      minAmount: getZcashMinMint(tableData),
      minShare: VOLUME_MIN,
      symbol: collateral.symbol,
    });
  if (!zcashQuoteResults.length) {
    // Every market that had something to do failed to price: that, not the amount, is the cause.
    if (failed.length) {
      throw new TradeError(
        `${failed.length} market${failed.length === 1 ? "" : "s"} could not be priced, and nothing else had a trade to make.`,
        `Their quotes failed ${ZCASH_QUOTE_ATTEMPTS} times each, usually a network problem rather than the pools. Nothing was traded in this step; try again in a minute.`,
      );
    }
    throw nothingToTrade();
  }

  const tradeExecutorCalls = getTradeExecutorCalls({
    quoteResults: zcashQuoteResults,
    tradeExecutor,
  });
  if (!tradeExecutorCalls.length) {
    throw nothingToTrade();
  }

  const input: CallBatchesInput = [];
  for (let i = 0; i < tradeExecutorCalls.length; i += BATCH_SIZE) {
    input.push({
      calls: tradeExecutorCalls.slice(i, i + BATCH_SIZE),
      message: `Executing trade batch ${i / BATCH_SIZE + 1}/${Math.ceil(tradeExecutorCalls.length / BATCH_SIZE)}`,
      skipFailCalls: true,
    });
  }

  const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange, 15_000_000n);
  if (!result.status) {
    await withdrawFundSessionKey();
    throw result.error;
  }

  prunedCalls += result.prunedCalls;

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
  toastSuccess({
    title: "Strategy executed",
    subtitle: skippedMarkets.length
      ? `${skippedMarkets.length} market${skippedMarkets.length === 1 ? " was" : "s were"} not traded. See the dialog.`
      : "",
  });
  return { ...result, prunedCalls, skippedMarkets } satisfies ZcashRunResult;
};

/** What the dialog reports after a run that went through. */
export type ZcashRunResult = Extract<BatchTxResult, { status: true }> & {
  /** Markets whose quotes failed every attempt, by proposal title, so were left out. */
  skippedMarkets: string[];
};

const skippedMarketNames = (failures: ZcashQuoteFailure[]) => [
  ...new Set(failures.map(({ row }) => row.project)),
];

const refreshAfterRun = () => {
  setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ["fetchZcashMarketsData"] });
    queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
    queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
  }, 3000);
};

export const useExecuteZcashStrategy = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationKey: TRADE_RUN_MUTATION_KEY,
    mutationFn: withRunLock((tradeProps: ZcashTradeProps) =>
      executeZcashStrategy({
        ...tradeProps,
        onStateChange: progress.onStateChange,
      })),
    onSuccess() {
      onSuccess?.();
      refreshAfterRun();
    },
    onError() {
      refreshAfterRun();
    },
  });
  return {
    ...mutation,
    progress,
  };
};

