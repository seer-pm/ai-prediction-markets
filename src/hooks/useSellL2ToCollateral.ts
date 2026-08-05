import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllL2Quotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, L2TableData, TxStateChange } from "@/types";
import { minBigIntArray } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";
import { mergeFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { getQuoteTradeCalls } from "@/utils/trade";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: L2TableData[];
}

async function sellL2ToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const sellAllQuotes = await getSellAllL2Quotes({
    account: tradeExecutor,
    tableData,
    onStateChange,
  });
  const swapCalls = getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const BATCH_SIZE = 100;
  const sellInput: CallBatchesInput = [];
  const sellBatchCount = Math.ceil(swapCalls.length / BATCH_SIZE);
  for (let i = 0; i < swapCalls.length; i += BATCH_SIZE) {
    sellInput.push({
      calls: swapCalls.slice(i, i + BATCH_SIZE),
      message: "Swapping outcome tokens back to parent collateral",
      phase: "sell",
      step: i / BATCH_SIZE + 1,
      of: sellBatchCount,
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
  onStateChange({ phase: "merge", label: "Reading collateral balances" });
  const collateralTokens = l2MarketOutcomes as Address[];
  const balances = await fetchTokensBalances(tradeExecutor, collateralTokens);
  const mergeAmount = minBigIntArray(balances);
  if (mergeAmount > 0n) {
    const mergeCalls = [
      ...mergeFromRouter(router, mergeAmount, L2_PARENT_MARKET_ID, collateralTokens),
    ];
    const mergeInput: CallBatchesInput = [];
    const mergeBatchCount = Math.ceil(mergeCalls.length / BATCH_SIZE);
    for (let i = 0; i < mergeCalls.length; i += BATCH_SIZE) {
      mergeInput.push({
        calls: mergeCalls.slice(i, i + BATCH_SIZE),
        message: "Merging complete sets back to sUSDS",
        phase: "merge",
        step: i / BATCH_SIZE + 1,
        of: mergeBatchCount,
        skipFailCalls: false,
      });
    }
    const result = await toastifyBatchTxSessionKey(tradeExecutor, mergeInput, onStateChange);
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  }

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
  return sellResult;
}

export const useSellL2ToCollateral = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: SellAllProps) =>
      sellL2ToCollateral({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
