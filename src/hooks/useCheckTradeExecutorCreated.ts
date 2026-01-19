import {
  checkOldTradeExecutorCreated,
  checkTradeExecutorCreated,
} from "@/lib/on-chain/deployTradeExecutor";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

export const useCheckTradeExecutorCreated = (account: Address | undefined) => {
  return useQuery({
    enabled: !!account,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryKey: ["useCheckTradeExecutorCreated", account],
    queryFn: () => checkTradeExecutorCreated(account!),
  });
};

export const useCheckOldTradeExecutorCreated = (account: Address | undefined) => {
  return useQuery({
    enabled: !!account,
    queryKey: ["useCheckOldTradeExecutorCreated", account],
    queryFn: () => checkOldTradeExecutorCreated(account!),
  });
};
