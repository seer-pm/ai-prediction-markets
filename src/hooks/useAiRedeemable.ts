import { useGetRedeemStatus } from "@/hooks/useGetRedeemStatus";
import { useMarketsData } from "@/hooks/useMarketsData";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { balancesResolved, redeemAvailability, type RedeemAvailability } from "@/utils/redeem";
import { useMemo } from "react";
import type { Address } from "viem";

/**
 * Whether the Round 1 contest has anything to redeem for this wallet.
 *
 * This used to live inside `RedeemInterface`, which meant the banner offering the redemption could
 * not know the answer — you clicked through to a dialog whose only content was "nothing here".
 * Hoisting it lets the CTA hide itself; React Query dedupes the reads, so both still cost one
 * fetch each.
 */
export function useAiRedeemable(tradeExecutor: Address | undefined) {
  const { data: marketsData } = useMarketsData();
  const wrappedTokens = useMemo(
    () => marketsData?.wrappedTokens ?? [],
    [marketsData?.wrappedTokens],
  );

  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    tradeExecutor,
    wrappedTokens,
  );
  const { data: redeemStatusData, isLoading: isLoadingRedeemStatus } = useGetRedeemStatus();

  const isLoading = isLoadingBalances || isLoadingRedeemStatus;
  const isRedeemable = !!redeemStatusData?.isRedeemable;
  const sumBalances = balances?.reduce((total, balance) => total + balance, 0n) ?? 0n;

  const availability: RedeemAvailability = redeemAvailability({
    hasRedeemable: isRedeemable && sumBalances > 0n,
    isResolved:
      !isLoading &&
      !!marketsData &&
      redeemStatusData !== undefined &&
      // A resolved "not open yet" is as confident an answer as an empty balance.
      (!isRedeemable || balancesResolved(balances, wrappedTokens)),
  });

  return {
    wrappedTokens,
    balances,
    /** Whether the round itself has resolved — independent of what this wallet holds. */
    isRedeemable,
    sumBalances,
    isLoading,
    availability,
  };
}
