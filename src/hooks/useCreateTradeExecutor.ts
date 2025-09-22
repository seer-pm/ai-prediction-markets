import { queryClient } from "@/config/queryClient";
import { initTradeExecutor } from "@/lib/on-chain/deployTradeExecutor";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";

export const useCreateTradeExecutor = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: ({ account }: { account: Address }) => initTradeExecutor(account),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useCheckTradeExecutorCreated"] });
    },
  });
};
