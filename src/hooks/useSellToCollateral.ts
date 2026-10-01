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
import { OriginalityMiddleMarket } from "@/utils/originalityRounds";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: OriginalityTableData[];
  parentMarketId: Address;
  /** The parent's Invalid outcome token — a complete set includes it. */
  parentInvalidToken: Address;
  /**
   * Markets between the parent and the repo markets. Selling returns each repo's own token, which
   * only becomes a parent outcome token again by merging its middle market.
   */
  middleMarkets?: readonly OriginalityMiddleMarket[];
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  parentMarketId,
  parentInvalidToken,
  middleMarkets,
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
  // With a middle level the sells came back as repo tokens. Merge each middle market first — a
  // complete set of its outcome tokens, Invalid included — to get the parent's outcome tokens
  // back; the parent merge below then reads balances that include what these produced.
  if (middleMarkets?.length) {
    const middleInput: CallBatchesInput = [];
    for (const [index, middle] of middleMarkets.entries()) {
      const tokens = [...middle.wrappedTokens];
      const amount = minBigIntArray(await fetchTokensBalances(tradeExecutor, tokens));
      if (amount <= 0n) continue;
      middleInput.push({
        // One market per batch: a merge unwraps every outcome token, ~34 of them here.
        calls: mergeFromRouter(router, amount, middle.marketId, tokens),
        message: "Merging repository tokens back to bundle tokens",
        phase: "merge",
        step: index + 1,
        of: middleMarkets.length,
        skipFailCalls: false,
      });
    }
    if (middleInput.length) {
      const result = await toastifyBatchTxSessionKey(tradeExecutor, middleInput, onStateChange);
      if (!result.status) {
        await withdrawFundSessionKey();
        throw result.error;
      }
    }
  }
  // One entry per parent outcome token. With a middle level those are the middle markets'
  // collateral. Without one they are the rows' own collateral: round 2 has one per repo already,
  // and in the incorrect round-3 set ~33 repos share each bundle token — listing it 33 times
  // would only repeat its approve.
  const parentOutcomeTokens = middleMarkets?.length
    ? middleMarkets.map((middle) => middle.collateralToken)
    : [...new Map(tableData.map((x) => [x.collateralToken.toLowerCase(), x.collateralToken])).values()];
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
