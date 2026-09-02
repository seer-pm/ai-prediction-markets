import {
  checkOldTradeExecutorCreated,
  checkTradeExecutorCreated,
} from "@/lib/on-chain/deployTradeExecutor";
import { useWalletStore } from "@/stores/walletStore";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

/**
 * A deployment is permanent, so these reads are cached hard and never refetched on their own.
 * Shared between the hooks below rather than copied: two observers on the *same* query key with
 * different options is a real hazard — the laxer one's default 5-minute staleTime would trigger the
 * refetches the other is deliberately avoiding.
 */
const EXECUTOR_QUERY_OPTIONS = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
  refetchInterval: false,
  staleTime: 24 * 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
} as const;

/**
 * The executor the app is currently *acting as* — the deprecated one while `isUseOldWallet` is on.
 * Anything that needs the current generation regardless of that flag wants
 * `useCheckNewTradeExecutorCreated` instead.
 */
export const useCheckTradeExecutorCreated = (account: Address | undefined) => {
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);
  return useQuery({
    ...EXECUTOR_QUERY_OPTIONS,
    enabled: !!account,
    queryKey: ["useCheckTradeExecutorCreated", account, isUseOldWallet],
    queryFn: () =>
      isUseOldWallet ? checkOldTradeExecutorCreated(account!) : checkTradeExecutorCreated(account!),
  });
};

/**
 * The current-generation executor, whichever wallet is selected.
 *
 * Shares a key with the hook above in its flag-off state — same key, same `queryFn`, so the two
 * genuinely dedupe rather than racing. The wallet board needs both generations on screen at once,
 * which the flag-dependent hook can only ever answer for one of.
 */
export const useCheckNewTradeExecutorCreated = (account: Address | undefined) =>
  useQuery({
    ...EXECUTOR_QUERY_OPTIONS,
    enabled: !!account,
    queryKey: ["useCheckTradeExecutorCreated", account, false],
    queryFn: () => checkTradeExecutorCreated(account!),
  });

export const useCheckOldTradeExecutorCreated = (account: Address | undefined) => {
  return useQuery({
    enabled: !!account,
    queryKey: ["useCheckOldTradeExecutorCreated", account],
    queryFn: () => checkOldTradeExecutorCreated(account!),
  });
};
