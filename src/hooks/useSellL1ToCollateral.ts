import { queryClient } from "@/config/queryClient";
import { getSellAllL1Quotes } from "@/lib/trade/getQuote";
import { TableData } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { getQuoteTradeCalls } from "./useExecuteOriginalityStrategy";
import { toastifyBatchTx } from "@/lib/toastify";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: TableData[];
}

async function sellToCollateral({ tradeExecutor, tableData }: SellAllProps) {
  const sellAllQuotes = await getSellAllL1Quotes({
    account: tradeExecutor,
    tableData,
  });
  const swapCalls = await getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const result = await toastifyBatchTx(tradeExecutor, swapCalls, {
    txSent: "Selling all tokens to sUSDS...",
    txSuccess: "Tokens sold!",
  });
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useSellL1ToCollateral = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: SellAllProps) => sellToCollateral(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
