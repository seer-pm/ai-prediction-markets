import { checkTradeExecutorCreated } from "@/lib/on-chain/deployTradeExecutor";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

export const useCheckTradeExecutorCreated = (account: Address | undefined) => {
  return useQuery({
    enabled: !!account,
    queryKey: ["useCheckTradeExecutorCreated", account],
    queryFn: () => checkTradeExecutorCreated(account!),
  });
};
