import {
  checkOldTradeExecutorCreated,
  checkTradeExecutorCreated,
} from "@/lib/on-chain/deployTradeExecutor";
import { useWalletStore } from "@/stores/walletStore";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

export const useCheckTradeExecutorCreated = (account: Address | undefined) => {
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);
  return useQuery({
    enabled: !!account,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useCheckTradeExecutorCreated", account, isUseOldWallet],
    queryFn: () =>
      isUseOldWallet ? checkOldTradeExecutorCreated(account!) : checkTradeExecutorCreated(account!),
  });
};

export const useCheckOldTradeExecutorCreated = (account: Address | undefined) => {
  return useQuery({
    enabled: !!account,
    queryKey: ["useCheckOldTradeExecutorCreated", account],
    queryFn: () => checkOldTradeExecutorCreated(account!),
  });
};
