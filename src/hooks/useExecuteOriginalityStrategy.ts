import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getOriginalityQuotes, getSellFromBalanceQuotes } from "@/lib/trade/getQuote";
import {
  CallBatchesInput,
  OriginalityTableData,
  OriginalityTradeProps,
  UniswapQuoteTradeResult,
} from "@/types";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  DECIMALS,
  ORIGINALITY_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
  quoteResults: {
    quotes: UniswapQuoteTradeResult[];
    quoteType: string;
    row: OriginalityTableData;
  }[];
}) => {
  const calls = quoteResults!
    .map(({ quotes, quoteType, row }) => {
      const tradeCalls = getQuoteTradeCalls(tradeExecutor, quotes);
      if (quoteType === "simple") {
        return tradeCalls;
      }
      const splitCalls = getSplitCalls({
        amount: row.amount!,
        collateral: row.collateralToken,
        mainCollateral,
        market: row.marketId as Address,
      });
      return [...splitCalls, ...tradeCalls];
    })
    .flat();

  return [...calls];
};

const executeOriginalityStrategy = async ({
  amount,
  tableData,
  tradeExecutor,
  onStateChange,
}: OriginalityTradeProps & { onStateChange: (state: string) => void }) => {
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
  const mainSplitCalls = getSplitCalls({
    collateral: mainCollateral,
    mainCollateral,
    amount,
    market: ORIGINALITY_PARENT_MARKET_ID,
  });

  const newTableData = tableData.map((initialRow) => {
    const row = { ...initialRow };
    //update volumeUntilPrice
    for (let i = 0; i < row.wrappedTokens.length; i++) {
      const data = sellTokenMapping[row.wrappedTokens[i]];
      if (data) {
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
      row.amount = formatUnits((data?.value ?? 0n) + parseUnits(amount, DECIMALS), DECIMALS);
    }
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
  input.push({
    calls: mainSplitCalls,
    message: "Minting tokens",
    skipFailCalls: false,
  });
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

  await withdrawFundSessionKey();
  toastSuccess({
    title: "Trade executed",
  });
  return result;
};

export const useExecuteOriginalityStrategy = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (tradeProps: OriginalityTradeProps) =>
      executeOriginalityStrategy({
        ...tradeProps,
        onStateChange: (state) => {
          setTxState(state);
          console.log(state);
        },
      }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useOriginalityMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOriginalityQuotes"] });
      }, 3000);
    },
    onError() {
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useOriginalityMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOriginalityQuotes"] });
      }, 3000);
    },
  });
  return {
    ...mutation,
    txState,
  };
};
