import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllL2Quotes } from "@/lib/trade/getQuote";
import { L2BatchesInput, L2TableData } from "@/types";
import { minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES
} from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address } from "viem";
import { mergeFromRouter } from "./useExecuteL2Strategy";
import { getQuoteTradeCalls } from "./useExecuteOriginalityStrategy";
import { fetchTokensBalances } from "./useTokensBalances";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: L2TableData[];
}

async function sellL2ToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: (state: string) => void }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  onStateChange("Getting quotes");
  const sellAllQuotes = await getSellAllL2Quotes({
    account: tradeExecutor,
    tableData,
    onStateChange,
  });
  const swapCalls = getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const BATCH_SIZE = 100;
  const sellInput: L2BatchesInput = [];
  for (let i = 0; i < swapCalls.length; i += BATCH_SIZE) {
    sellInput.push({
      calls: swapCalls.slice(i, i + BATCH_SIZE),
      message: `Swapping tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(swapCalls.length / BATCH_SIZE)}`,
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
  onStateChange("Updating collateral balances");
  const collateralTokens = l2MarketOutcomes as Address[];
  const balances = await fetchTokensBalances(tradeExecutor, collateralTokens);
  const mergeAmount = minBigIntArray(balances);
  if (mergeAmount > 0n) {
    const mergeCalls = [
      ...mergeFromRouter(router, mergeAmount, L2_PARENT_MARKET_ID, collateralTokens),
    ];
    const mergeInput: L2BatchesInput = [];
    for (let i = 0; i < mergeCalls.length; i += BATCH_SIZE) {
      mergeInput.push({
        calls: mergeCalls.slice(i, i + BATCH_SIZE),
        message: `Merging tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(mergeCalls.length / BATCH_SIZE)}`,
        skipFailCalls: false,
      });
    }
    const result = await toastifyBatchTxSessionKey(tradeExecutor, mergeInput, onStateChange);
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  }

  await withdrawFundSessionKey();
  return sellResult;
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
