import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getTradeApprovals7702 } from "@/lib/trade/getApprovals7702";
import { OriginalityTradeProps } from "@/types";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  DECIMALS,
  ORIGINALITY_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { writeContract } from "@wagmi/core";
import { Address, encodeFunctionData, parseUnits } from "viem";

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

const getTradeExecutorCalls = async ({
  amount,
  quoteResults,
  tradeExecutor,
}: OriginalityTradeProps) => {
  const mainCollateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;
  const mainSplitCalls = getSplitCalls({
    collateral: mainCollateral,
    mainCollateral,
    amount,
    market: ORIGINALITY_PARENT_MARKET_ID,
  });
  const calls = (
    await Promise.all(
      quoteResults!.map(async ({ quotes, quoteType, row }) => {
        const tradeApprovalCalls = quotes
          .map((quote) => getTradeApprovals7702(tradeExecutor, quote.trade))
          .flat();
        const tradeCalls = await Promise.all(
          quotes.map((quote) => getUniswapTradeExecution(quote.trade, tradeExecutor))
        );
        if (quoteType === "simple") {
          return [...tradeApprovalCalls, ...tradeCalls];
        }
        const splitCalls = getSplitCalls({
          amount,
          collateral: row.collateralToken,
          mainCollateral,
          market: row.marketId as Address,
        });
        return [...splitCalls, ...tradeApprovalCalls, ...tradeCalls];
      })
    )
  ).flat();

  return [...mainSplitCalls, ...calls];
};

const executeOriginalityStrategy = async ({
  amount,
  quoteResults,
  tradeExecutor,
}: OriginalityTradeProps) => {
  if (!quoteResults?.length) {
    throw new Error("No quote found");
  }
  const tradeExecutorCalls = await getTradeExecutorCalls({
    amount,
    quoteResults,
    tradeExecutor,
  });

  const writePromise = writeContract(config, {
    address: tradeExecutor,
    abi: TradeExecutorAbi,
    functionName: "batchExecute",
    args: [tradeExecutorCalls.map((call) => ({ data: call.data, to: call.to }))],
    value: 0n,
    chainId: CHAIN_ID,
  });

  const result = await toastifyTx(() => writePromise, {
    txSent: { title: "Executing trade..." },
    txSuccess: { title: "Trade executed!" },
  });
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
