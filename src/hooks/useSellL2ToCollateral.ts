import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getApprovals7702 } from "@/lib/trade/getApprovals7702";
import { getSellAllL2Quotes } from "@/lib/trade/getQuote";
import { L2BatchesInput, L2TableData } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData } from "viem";
import { getQuoteTradeCalls } from "./useExecuteOriginalityStrategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { useState } from "react";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: L2TableData[];
}

async function sellL2ToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: (state: string) => void }) {
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  onStateChange("Getting quotes");
  const sellAllQuotes = await getSellAllL2Quotes({
    account: tradeExecutor,
    tableData,
    onStateChange,
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
    }),
  );
  if (mergeAmount > 0n) {
    swapCalls.push(
      ...getApprovals7702({
        tokensAddresses: collateralTokens,
        account: tradeExecutor,
        spender: router,
        amounts: mergeAmount,
        chainId: CHAIN_ID,
      }),
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

  const BATCH_SIZE = 100;
  const input: L2BatchesInput = [];
  for (let i = 0; i < swapCalls.length; i += BATCH_SIZE) {
    input.push({
      calls: swapCalls.slice(i, i + BATCH_SIZE),
      message: `Swapping tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(swapCalls.length / BATCH_SIZE)}`,
      skipFailCalls: true,
    });
  }
  const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange);
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useSellL2ToCollateral = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (props: SellAllProps) =>
      sellL2ToCollateral({ ...props, onStateChange: setTxState }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
  return {
    ...mutation,
    txState,
  };
};
