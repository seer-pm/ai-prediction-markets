import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllZcashQuotes } from "@/lib/trade/getZcashQuote";
import { CallBatchesInput, TxStateChange, ZcashTableData } from "@/types";
import { planZcashSetMerges } from "@/utils/completeSets";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { completeSetMergeBatches } from "./useSellToCollateral";
import { fetchTokensBalancesOrThrow } from "./useTokensBalances";
import { useTxProgress } from "./useTxProgress";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: ZcashTableData[];
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  // Each market's complete sets (YES + NO + Invalid) are merged straight back to sUSDS before
  // anything is sold, and only what is left unmatched is sold — see `planZcashSetMerges`. The
  // Invalid token of a merged set goes with it: its value is part of the sUSDS the merge pays.
  //
  // No progress event for this read: it runs before the session key is authorised. A failed
  // read must stop the run — read as empty, every pair would be sold instead of merged.
  const heldBalances = await fetchTokensBalancesOrThrow(
    tradeExecutor,
    tableData.flatMap((row) => row.wrappedTokens),
  );
  // `rows` is what is left to sell, from balances read just now rather than the table's.
  const { merges, rows } = planZcashSetMerges(tableData, heldBalances);
  if (merges.length) {
    const result = await toastifyBatchTxSessionKey(
      tradeExecutor,
      completeSetMergeBatches(merges, "Merging matched YES and NO tokens back to sUSDS"),
      onStateChange,
    );
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  } else {
    onStateChange({ phase: "unwind", label: "No matched YES and NO tokens to merge", skipped: true });
  }
  onStateChange({ phase: "requote", label: "Pricing your positions" });
  // Across 37 markets this can be up to 74 sells, so the batching below is load-bearing rather
  // than defensive.
  const sellAllQuotes = await getSellAllZcashQuotes({
    account: tradeExecutor,
    tableData: rows,
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
  if (!sellInput.length) {
    onStateChange({ phase: "sell", label: "Nothing left to sell after merging", skipped: true });
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

export const useSellZcashToCollateral = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationKey: TRADE_RUN_MUTATION_KEY,
    mutationFn: (props: SellAllProps) =>
      sellToCollateral({ ...props, onStateChange: progress.onStateChange }),
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
