import { queryClient } from "@/config/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { redeemFlatMarkets, type FlatMarketToRedeem } from "./redeemFlatMarkets";
import { useTxProgress } from "./useTxProgress";
import { REDEEMABLE_SCAN_KEY } from "./useRedeemableScan";

interface RedeemZcashProps {
  tradeExecutor: Address;
  /** One entry per Zcash market, each with its outcome tokens in outcome order `[YES, NO, INVALID]`. */
  markets: FlatMarketToRedeem[];
}

/**
 * The 37 grants markets are top-level and collateralized in sUSDS, so the shared flat-market redeem
 * covers them whole — see `./redeemFlatMarkets` for why Invalid is included and how the batching
 * groups markets rather than outcomes.
 */
export const useRedeemZcash = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemZcashProps) =>
      redeemFlatMarkets({ ...props, label: "Zcash", onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      // Refetch, not invalidate: the redeem CTA now hides itself on a zero balance, and a
      // lazily-invalidated cache would leave it on screen until the next mount.
      queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchZcashMarketsData"] });
      // The wallet board advertises this claim from a cached scan; without this it keeps
      // advertising one the user has just made.
      queryClient.refetchQueries({ queryKey: [REDEEMABLE_SCAN_KEY] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
