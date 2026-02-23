import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, OriginalityTableData } from "@/types";
import { minBigIntArray } from "@/utils/common";
import { CHAIN_ID, ORIGINALITY_PARENT_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address } from "viem";
import { mergeFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { getQuoteTradeCalls } from "@/utils/trade";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: OriginalityTableData[];
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: (state: string) => void }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  onStateChange("Getting quotes");
  const sellAllQuotes = await getSellAllQuotes({
    account: tradeExecutor,
    tableData,
  });
  const swapCalls = getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const BATCH_SIZE = 100;
  const sellInput: CallBatchesInput = [];
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
  const balances = await fetchTokensBalances(
    tradeExecutor,
    tableData.map((x) => x.collateralToken),
  );

  const mergeAmount = minBigIntArray(balances);
  if (mergeAmount > 0n) {
    const INVALID = "0x2281bb55063b8d036e5077f5b654c9bb1b397a34";

    const mergeCalls = [
      ...mergeFromRouter(router, mergeAmount, ORIGINALITY_PARENT_MARKET_ID, [
        ...tableData.map((x) => x.collateralToken),
        INVALID,
      ]),
    ];
    const mergeInput: CallBatchesInput = [];
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

export const useSellToCollateral = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (props: SellAllProps) => sellToCollateral({ ...props, onStateChange: setTxState }),
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
