import { queryClient } from "@/config/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { redeemFlatMarkets, type FlatMarketToRedeem } from "./redeemFlatMarkets";
import { REDEEMABLE_SCAN_KEY } from "./useRedeemableScan";
import { useTxProgress } from "./useTxProgress";

interface RedeemZcashNu7Props {
  tradeExecutor: Address;
  /** One entry per NU7 market, outcome tokens in on-chain order (Invalid last). */
  markets: FlatMarketToRedeem[];
}

/**
 * Same flat-market redeem as the grants set — these are top-level markets on sUSDS too — with this
 * contest's own caches to refresh.
 *
 * Session key rather than the owner-signed path `useTradeOutcome` uses: a redeem can span all five
 * markets at once and shares the `RedeemL2Interface` progress ledger, which is built around it.
 */
export const useRedeemZcashNu7 = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemZcashNu7Props) =>
      redeemFlatMarkets({ ...props, label: "Zcash NU7", onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchZcashNu7MarketsData"] });
      queryClient.refetchQueries({ queryKey: [REDEEMABLE_SCAN_KEY] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
