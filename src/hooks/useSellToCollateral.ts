import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { getSellAllQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, OriginalityTableData, TxStateChange } from "@/types";
import { minBigIntArray } from "@/utils/common";
import { CHAIN_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";
import { mergeFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { getQuoteTradeCalls } from "@/utils/trade";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: OriginalityTableData[];
  parentMarketId: Address;
  /** The parent's Invalid outcome token — a complete set includes it. */
  parentInvalidToken: Address;
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  parentMarketId,
  parentInvalidToken,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  onStateChange({ phase: "requote", label: "Pricing your positions" });
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
      message: "Swapping outcome tokens back to collateral",
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
  onStateChange({ phase: "merge", label: "Reading collateral balances" });
  // One entry per parent outcome token. Round 2 has one per repo already; in round 3 ~33 repos
  // share each bundle token, and listing it 33 times would only repeat its approve.
  const parentOutcomeTokens = [
    ...new Map(tableData.map((x) => [x.collateralToken.toLowerCase(), x.collateralToken])).values(),
  ];
  // The Invalid leg is never traded, so it only holds what was minted; once every outcome token has
  // grown past that through profitable sells, merging the outcome-token minimum would revert.
  const balances = await fetchTokensBalances(tradeExecutor, [...parentOutcomeTokens, parentInvalidToken]);

  const mergeAmount = minBigIntArray(balances);
  if (mergeAmount > 0n) {
    const mergeCalls = [
      ...mergeFromRouter(router, mergeAmount, parentMarketId, [
        ...parentOutcomeTokens,
        parentInvalidToken,
      ]),
    ];
    const mergeInput: CallBatchesInput = [];
    for (let i = 0; i < mergeCalls.length; i += BATCH_SIZE) {
      mergeInput.push({
        calls: mergeCalls.slice(i, i + BATCH_SIZE),
        message: "Merging complete sets back to sUSDS",
        phase: "merge",
        step: i / BATCH_SIZE + 1,
        of: Math.ceil(mergeCalls.length / BATCH_SIZE),
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
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationKey: TRADE_RUN_MUTATION_KEY,
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
