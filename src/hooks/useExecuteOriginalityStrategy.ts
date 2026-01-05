import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx, toastInfo } from "@/lib/toastify";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getTradeApprovals7702 } from "@/lib/trade/getApprovals7702";
import { getOriginalityQuotes, getSellFromBalanceQuotes } from "@/lib/trade/getQuote";
import { OriginalityTableData, OriginalityTradeProps, UniswapQuoteTradeResult } from "@/types";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  DECIMALS,
  ORIGINALITY_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { simulateContract, writeContract } from "@wagmi/core";
import { Address, encodeFunctionData, formatUnits, parseUnits, TransactionReceipt } from "viem";

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

export const getQuoteTradeCalls = async (
  tradeExecutor: Address,
  quotes: UniswapQuoteTradeResult[]
) => {
  const tradeApprovalCalls = quotes
    .map((quote) => getTradeApprovals7702(tradeExecutor, quote.trade))
    .flat();
  const tradeCalls = await Promise.all(
    quotes.map((quote) => getUniswapTradeExecution(quote.trade, tradeExecutor))
  );
  return [...tradeApprovalCalls, ...tradeCalls];
};
const mainCollateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;

const getTradeExecutorCalls = async ({
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
  const calls = (
    await Promise.all(
      quoteResults!.map(async ({ quotes, quoteType, row }) => {
        const tradeCalls = await getQuoteTradeCalls(tradeExecutor, quotes);
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
    )
  ).flat();

  return [...calls];
};

export const toastifyBatchTx = async (
  tradeExecutor: Address,
  calls: {
    to: `0x${string}`;
    value?: bigint;
    data: `0x${string}`;
  }[],
  messageConfig: { txSent: string; txSuccess: string }
) => {
  //static call first
  try {
    await simulateContract(config, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [
        calls.map((call) => ({
          to: call.to,
          data: call.data,
        })),
      ],
      value: 0n,
      chainId: CHAIN_ID,
    });
  } catch (err) {
    return {
      status: false,
      error: err,
    };
  }

  const BATCH_SIZE = 75;
  const batches = [];

  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    batches.push(calls.slice(i, i + BATCH_SIZE));
  }

  const isSingleBatch = batches.length === 1;
  // Show initial info about batching
  if (!isSingleBatch) {
    toastInfo({
      title: "Processing multiple batches",
      subtitle: `Due to wallet limitations, ${calls.length} calls will be processed in ${batches.length} batches of up to ${BATCH_SIZE} calls each.`,
      options: { autoClose: 8000 },
    });
  }

  let lastReceipt: TransactionReceipt | undefined;

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const isLastBatch = i === batches.length - 1;

    const writePromise = writeContract(config, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [batch.map((call) => ({ data: call.data, to: call.to }))],
      value: 0n,
      chainId: CHAIN_ID,
    });
    const result = await toastifyTx(() => writePromise, {
      txSent: {
        title: isSingleBatch ? messageConfig.txSent : `Sending batch ${i + 1}/${batches.length}...`,
      },
      txSuccess: {
        title: isLastBatch ? messageConfig.txSuccess : `Batch ${i + 1}/${batches.length} sent!`,
      },
    });
    if (!result.status) {
      return { status: false, error: result.error };
    }

    lastReceipt = result.receipt;
  }

  return { status: true, receipt: lastReceipt! };
};

const executeOriginalityStrategy = async ({
  amount,
  tableData,
  tradeExecutor,
}: OriginalityTradeProps) => {
  if (!tableData?.length) {
    throw new Error("No prediction data");
  }

  const sellFromBalanceQuotes = await getSellFromBalanceQuotes({
    account: tradeExecutor,
    tableData,
  });

  const sellTokenMapping = sellFromBalanceQuotes.reduce((acc, result) => {
    acc[result.sellToken.toLowerCase()] = {
      sellAmount: BigInt(result.sellAmount),
      value: BigInt(result.value),
    };
    return acc;
  }, {} as { [key: string]: { sellAmount: bigint; value: bigint } });

  // we execute sellFromBalance trades first to update main quotes
  if (sellFromBalanceQuotes.length) {
    const sellFromBalanceCalls = await getQuoteTradeCalls(tradeExecutor, sellFromBalanceQuotes);
    const result = await toastifyBatchTx(tradeExecutor, sellFromBalanceCalls, {
      txSent: "Selling overvalued tokens from balance...",
      txSuccess: "Tokens sold!",
    });
    if (!result.status) {
      throw result.error;
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
  const tradeExecutorCalls = await getTradeExecutorCalls({
    quoteResults: originalityQuoteResults,
    tradeExecutor,
  });
  const result = await toastifyBatchTx(
    tradeExecutor,
    [...mainSplitCalls, ...tradeExecutorCalls].map((call) => ({ data: call.data, to: call.to })),
    {
      txSent: "Executing trade...",
      txSuccess: "Trade executed!",
    }
  );

  if (!result.status) {
    throw result.error;
  }
  return result;
};

export const useExecuteOriginalityStrategy = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (tradeProps: OriginalityTradeProps) => executeOriginalityStrategy(tradeProps),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useOriginalityMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetOriginalityQuotes"] });
      }, 3000);
    },
  });
};
