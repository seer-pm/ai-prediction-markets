import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { getApprovals7702 } from "@/lib/trade/getApprovals7702";
import { getSellAllL2Quotes } from "@/lib/trade/getQuote";
import { L2TableData } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData } from "viem";
import { getQuoteTradeCalls, toastifyBatchTx } from "./useExecuteOriginalityStrategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: L2TableData[];
}

async function sellL2ToCollateral({ tradeExecutor, tableData }: SellAllProps) {
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const sellAllQuotes = await getSellAllL2Quotes({
    account: tradeExecutor,
    tableData,
  });
  const swapCalls = await getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const collateralTokens = l2MarketOutcomes as Address[];
  const balances = await fetchTokensBalances(tradeExecutor, collateralTokens);
  const mergeAmount = minBigIntArray(
    balances.map((balance, index) => {
      const soldValue = sellAllQuotes
        .filter((data) => isTwoStringsEqual(data.buyToken, collateralTokens[index]))
        .reduce((acc, curr) => acc + curr.value, 0n);
      return balance + soldValue;
    })
  );
  if (mergeAmount > 0n) {
    swapCalls.push(
      ...getApprovals7702({
        tokensAddresses: collateralTokens,
        account: tradeExecutor,
        spender: router,
        amounts: mergeAmount,
        chainId: CHAIN_ID,
      })
    );

    swapCalls.push({
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "mergePositions",
        args: [collateral.address, L2_PARENT_MARKET_ID, mergeAmount],
      }),
    });
  }
  const result = await toastifyBatchTx(tradeExecutor, swapCalls, {
    txSent: "Selling all tokens to sUSDS...",
    txSuccess: "Tokens sold!",
  });
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useSellL2ToCollateral = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: SellAllProps) => sellL2ToCollateral(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
