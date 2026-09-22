import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getOriginalityQuotes, getSellFromBalanceQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, OriginalityQuoteResult, OriginalityTradeProps, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, DECIMALS, ROUTER_ADDRESSES } from "@/utils/constants";
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

/**
 * Whether `compareOriginalityQuotes` can spend this row's budget: it needs the prediction on both
 * sides, or the UP+DOWN>1 arbitrage, which ignores the prediction.
 */
const canSpend = (row: OriginalityTradeProps["tableData"][number]) =>
  (!!row.upDifference && !!row.downDifference) ||
  (row.volumeUntilUpEqual > 0 && row.volumeUntilDownEqual > 0);

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
  // whole mint. In round 3 ~33 rows share a bundle token, so that token's mint is divided among the
  // rows that can spend it — handing each the whole amount would overdraw it ~33 times over.
  const spendersPerToken = new Map<string, bigint>();
  for (const row of tableData) {
    if (!canSpend(row)) continue;
    const key = row.collateralToken.toLowerCase();
    spendersPerToken.set(key, (spendersPerToken.get(key) ?? 0n) + 1n);
  }

  const newTableData = tableData.map((initialRow) => {
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
    const spenders = spendersPerToken.get(row.collateralToken.toLowerCase()) ?? 1n;
    row.amount = formatUnits(sellProceeds + mintValue / spenders, DECIMALS);
    return row;
  });
  const originalityQuoteResults = await getOriginalityQuotes({
    account: tradeExecutor,
    tableData: newTableData,
  });
  if (!originalityQuoteResults.length) {
    throw new Error("No quote found");
  }
  const tradeExecutorCalls = getTradeExecutorCalls({
    quoteResults: originalityQuoteResults,
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
