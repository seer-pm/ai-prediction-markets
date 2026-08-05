import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllOctantQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, TableData, TxStateChange } from "@/types";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: TableData[];
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  const sellAllQuotes = await getSellAllOctantQuotes({
    account: tradeExecutor,
    tableData,
  });
  const swapCalls = getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const BATCH_SIZE = 100;
  const sellInput: CallBatchesInput = [];
  for (let i = 0; i < swapCalls.length; i += BATCH_SIZE) {
    sellInput.push({
      calls: swapCalls.slice(i, i + BATCH_SIZE),
      message: "Swapping outcome tokens back to sUSDS",
      phase: "sell",
      step: i / BATCH_SIZE + 1,
      of: Math.ceil(swapCalls.length / BATCH_SIZE),
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
  await withdrawFundSessionKey();
  return sellResult;
}

export const useSellOctantToCollateral = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: SellAllProps) => sellToCollateral({ ...props, onStateChange: progress.onStateChange }),
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
