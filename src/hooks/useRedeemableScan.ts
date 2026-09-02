import { fetchAppJson } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePageIdle } from "./usePageIdle";

export interface RedeemableScanResult {
  checkedAt: number;
  /** executor address (lowercase) → contest id → whether anything settled is held there. */
  wallets: Record<string, Record<string, boolean>>;
  /** Deployed executors in bytecode order: current first, then deprecated. Either may be absent. */
  executors: string[];
}

/** The scan's query key, exported so the redeem mutations can refetch it by name. */
export const REDEEMABLE_SCAN_KEY = "useRedeemableScan";

/**
 * Whether this participant still holds anything claimable, in any contest, on either trade wallet.
 *
 * Nothing else in the app knows this. Each contest tab reads only its own balances, and `Tab.tsx`
 * mounts a tab only once it has been visited — so a settled claim in a contest you never opened has
 * never been looked for. Four of the six contests are archived behind a dropdown, which makes that
 * the common case.
 *
 * Gated on `usePageIdle` rather than running on mount: the scan sweeps thousands of token balances
 * and answers a question nobody asked out loud, so it waits until the page has nothing else in
 * flight. Both executor addresses are derived server-side from the connected EOA — asking the
 * client for them would mean asking `useTradeWalletStatus`, whose `tradeExecutor` silently points
 * at the deprecated contract while the `isUseOldWallet` flag is on.
 *
 * Not persisted to localStorage (see `PERSISTED_QUERY_KEYS` in `@/config/queryClient`): a restored
 * answer is a stale factual claim about someone's money, unlike the cosmetic entries on that list.
 */
export function useRedeemableScan(account: Address | undefined) {
  const isIdle = usePageIdle();

  return useQuery({
    enabled: isIdle && !!account,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    queryKey: [REDEEMABLE_SCAN_KEY, account],
    queryFn: () => fetchAppJson<RedeemableScanResult>(`get-redeemable?account=${account}`),
  });
}
