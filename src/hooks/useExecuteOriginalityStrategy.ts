import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getOriginalityQuotes, getSellFromBalanceQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, OriginalityQuoteResult, OriginalityTradeProps, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, DECIMALS, ROUTER_ADDRESSES, VOLUME_MIN } from "@/utils/constants";
import { safeParseUnits } from "@/utils/format";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address, encodeFunctionData, formatUnits, parseUnits } from "viem";

const getSplitCalls = ({
  collateral,
  mainCollateral,
  amount,
  market,
}: {
  collateral: Address;
  mainCollateral: Address;
  amount: string;
  market: Address;
}) => {
  const parsedAmount = parseUnits(amount, DECIMALS);
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  return [
    {
      to: collateral,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [router, parsedAmount],
      }),
    },
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "splitPosition",
        args: [mainCollateral, market, parsedAmount],
      }),
    },
  ];
};

const mainCollateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;

const getTradeExecutorCalls = ({
  quoteResults,
  tradeExecutor,
}: {
  tradeExecutor: Address;
  quoteResults: OriginalityQuoteResult[];
}) => {
  const calls = quoteResults!
    .map(({ quotes, quoteType, row, mintAmount }) => {
      const tradeCalls = getQuoteTradeCalls(tradeExecutor, quotes);
      if (quoteType === "simple" || quoteType === "dual-buy") {
        return tradeCalls;
      }
      // The arb mints exactly what it sells; skip the split when nothing to mint
      // (pure balance-sell) so we don't emit a wasted splitPosition(0).
      const splitAmount = quoteType === "arb-sell" ? mintAmount! : row.amount!;
      if (Number(splitAmount) <= 0) {
        return tradeCalls;
      }
      const splitCalls = getSplitCalls({
        amount: splitAmount,
        collateral: row.collateralToken,
        mainCollateral,
        market: row.marketId as Address,
      });
      return [...splitCalls, ...tradeCalls];
    })
    .flat();

  return [...calls];
};

type TableRow = OriginalityTradeProps["tableData"][number];

/**
 * How much of its collateral token this row can put to work — what `compareOriginalityQuotes` would
 * spend given an unlimited budget, mirroring its branches. The UP+DOWN>1 arbitrage mints only the
 * headroom left after selling tokens already owned. Every prediction path is bounded by the larger
 * side's volume-until-price, which is collateral for a buy and tokens (so collateral to split) for a
 * sell; a dual buy gives each side half its budget, so it needs twice that.
 */
const spendCapacity = (row: TableRow): number => {
  if (row.volumeUntilUpEqual >= VOLUME_MIN || row.volumeUntilDownEqual >= VOLUME_MIN) {
    const upBalance = Number(formatUnits(row.upBalance ?? 0n, DECIMALS));
    const downBalance = Number(formatUnits(row.downBalance ?? 0n, DECIMALS));
    return Math.max(
      0,
      Math.min(row.volumeUntilUpEqual - upBalance, row.volumeUntilDownEqual - downBalance),
    );
  }
  if (!row.upDifference || !row.downDifference) return 0;
  const largest = Math.max(row.volumeUntilUpPrice, row.volumeUntilDownPrice);
  if (largest < VOLUME_MIN) return 0;
  return row.upDifference > 0 && row.downDifference > 0 ? 2 * largest : largest;
};

/**
 * The smallest mint, in sUSDS, that gives every tradeable row at least the quote minimum. A mint of
 * `x` yields `x` of each parent outcome token, so the binding group is the largest set of tradeable
 * rows sharing one: 1 in round 2, up to ~33 for a round-3 bundle. `undefined` when nothing trades.
 */
export const getOriginalityMinMint = (tableData: TableRow[]): number | undefined => {
  const rowsPerToken = new Map<string, number>();
  for (const row of tableData) {
    if (spendCapacity(row) < VOLUME_MIN) continue;
    const key = row.collateralToken.toLowerCase();
    rowsPerToken.set(key, (rowsPerToken.get(key) ?? 0) + 1);
  }
  if (!rowsPerToken.size) return undefined;
  return Math.ceil(VOLUME_MIN * Math.max(...rowsPerToken.values()) * 100) / 100;
};

const NO_TRADE_MESSAGE =
  "None of your predictions produced a trade. Each repository needs at least " +
  `${VOLUME_MIN} of its collateral to quote, and the amount is shared across the repositories that ` +
  "trade — try a larger amount. If it persists, the pools may lack liquidity at your targets.";

/**
 * Splits one collateral token's budget among the rows that spend it. Rows are filled smallest
 * capacity first, each taking at most an even share of what is left, so budget a row cannot use
 * passes to the rows that can. What no row can use is then spread evenly rather than held back —
 * capacities are estimates off pool state, and an even split is what this replaced. With one row
 * per token (round 2) that row gets the whole budget, as before.
 */
const allocateBudget = (budget: bigint, capacities: bigint[]): bigint[] => {
  const shares = capacities.map(() => 0n);
  if (!capacities.length) return shares;
  const order = capacities
    .map((_, index) => index)
    .sort((a, b) => (capacities[a] < capacities[b] ? -1 : capacities[a] > capacities[b] ? 1 : 0));
  let remaining = budget;
  order.forEach((index, position) => {
    const evenShare = remaining / BigInt(order.length - position);
    const share = capacities[index] < evenShare ? capacities[index] : evenShare;
    shares[index] = share;
    remaining -= share;
  });
  const surplus = remaining / BigInt(capacities.length);
  return shares.map((share) => share + surplus);
};

const executeOriginalityStrategy = async ({
  amount,
  tableData,
  tradeExecutor,
  parentMarketId,
  onStateChange,
}: OriginalityTradeProps & { onStateChange: TxStateChange }) => {
  if (!tableData?.length) {
    throw new Error("No prediction data");
  }

  const sellFromBalanceQuotes = await getSellFromBalanceQuotes({
    account: tradeExecutor,
    tableData,
  });

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
  // we execute sellFromBalance trades first to update main quotes
  if (sellFromBalanceQuotes.length) {
    const sellFromBalanceCalls = getQuoteTradeCalls(tradeExecutor, sellFromBalanceQuotes);
    const sellInput: CallBatchesInput = [];
    for (let i = 0; i < sellFromBalanceCalls.length; i += 100) {
      sellInput.push({
        calls: sellFromBalanceCalls.slice(i, i + 100),
        message: `Selling overvalued tokens from balance batch ${i / 100 + 1}/${Math.ceil(sellFromBalanceCalls.length / 100)}`,
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
  }
  const didMint = Number(amount) > 0;
  const mintValue = safeParseUnits(amount, DECIMALS);

  // Splitting `amount` on the parent mints `amount` of EACH parent outcome token, and a row spends
  // its own collateral token. In round 2 every repo has its own parent token, so each row gets the
  // whole mint. In round 3 ~33 rows share a bundle token, so that token's mint — and the proceeds
  // of the balance sells above, which land in it too — are divided among the rows that can spend
  // them, by how much each can use. Handing each the whole amount would overdraw it ~33 times over.
  const sellProceedsPerRow: bigint[] = [];
  const adjustedRows = tableData.map((initialRow) => {
    const row = { ...initialRow };
    let sellProceeds = 0n;
    //update volumeUntilPrice
    for (let i = 0; i < row.wrappedTokens.length; i++) {
      // `sellTokenMapping` is keyed lowercase; MarketView returns checksummed addresses.
      const data = sellTokenMapping[row.wrappedTokens[i].toLowerCase()];
      if (data) {
        sellProceeds += data.value;
        if (i === 0) {
          row.volumeUntilDownPrice =
            row.volumeUntilDownPrice - Number(formatUnits(data.sellAmount, DECIMALS));
          row.downBalance = row.downBalance ? row.downBalance - data.sellAmount : row.downBalance;
        } else {
          row.volumeUntilUpPrice =
            row.volumeUntilUpPrice - Number(formatUnits(data.sellAmount, DECIMALS));
          row.upBalance = row.upBalance ? row.upBalance - data.sellAmount : row.upBalance;
        }
      }
    }
    sellProceedsPerRow.push(sellProceeds);
    return row;
  });

  const rowsPerToken = new Map<string, number[]>();
  adjustedRows.forEach((row, index) => {
    const key = row.collateralToken.toLowerCase();
    rowsPerToken.set(key, [...(rowsPerToken.get(key) ?? []), index]);
  });
  const budgets = adjustedRows.map(() => 0n);
  for (const indexes of rowsPerToken.values()) {
    const spenders = indexes
      .map((index) => ({
        index,
        capacity: safeParseUnits(spendCapacity(adjustedRows[index]).toFixed(DECIMALS), DECIMALS),
      }))
      .filter(({ capacity }) => capacity > 0n);
    const budget = indexes.reduce((sum, index) => sum + sellProceedsPerRow[index], mintValue);
    const shares = allocateBudget(
      budget,
      spenders.map(({ capacity }) => capacity),
    );
    spenders.forEach(({ index }, position) => {
      budgets[index] = shares[position];
    });
  }
  const newTableData = adjustedRows.map((row, index) => ({
    ...row,
    amount: formatUnits(budgets[index], DECIMALS),
  }));
  const originalityQuoteResults = await getOriginalityQuotes({
    account: tradeExecutor,
    tableData: newTableData,
  });
  // A dual sell whose sides both came back unquoted still carries a result, and on its own would
  // only split the row's budget into pairs it never sells.
  const tradeableQuoteResults = originalityQuoteResults.filter(({ quotes }) => quotes.length > 0);
  if (!tradeableQuoteResults.length) {
    throw new Error(NO_TRADE_MESSAGE);
  }
  const tradeExecutorCalls = getTradeExecutorCalls({
    quoteResults: tradeableQuoteResults,
    tradeExecutor,
  });
  const input: CallBatchesInput = [];
  if (didMint) {
    input.push({
      calls: getSplitCalls({
        collateral: mainCollateral,
        mainCollateral,
        amount,
        market: parentMarketId,
      }),
      message: "Minting complete sets",
      phase: "mint",
      skipFailCalls: false,
    });
  }
  for (let i = 0; i < tradeExecutorCalls.length; i += 100) {
    input.push({
      calls: tradeExecutorCalls.slice(i, i + 100),
      message: `Executing trade batch ${i / 100 + 1}/${Math.ceil(tradeExecutorCalls.length / 100)}`,
      skipFailCalls: true,
    });
  }
  const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange, 15_000_000n);
  if (!result.status) {
    await withdrawFundSessionKey();
    throw result.error;
  }

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
  toastSuccess({ title: "Strategy executed" });
  return result;
};

export const useExecuteOriginalityStrategy = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationKey: TRADE_RUN_MUTATION_KEY,
    mutationFn: (tradeProps: OriginalityTradeProps) =>
      executeOriginalityStrategy({
        ...tradeProps,
        onStateChange: progress.onStateChange,
      }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["fetchOriginalityMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOriginalityQuotes"] });
      }, 3000);
    },
    onError() {
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["fetchOriginalityMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOriginalityQuotes"] });
      }, 3000);
    },
  });
  return {
    ...mutation,
    progress,
  };
};
