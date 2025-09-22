import { erc20Abi } from "@/abis/erc20Abi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { CHAIN_ID } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { writeContract } from "@wagmi/core";
import { Address, encodeFunctionData } from "viem";
import { Execution } from "./useCheck7702Support";

interface DepositProps {
  tradeExecutor: Address;
  tokens: Address[];
  amounts: bigint[];
  use7702: boolean;
}

async function depositToTradeExecutor({ tradeExecutor, tokens, amounts, use7702 }: DepositProps) {
  const calls: Execution[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const amount = amounts[i];
    if (use7702) {
      calls.push({
        to: token,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [tradeExecutor, amount],
        }),
      });
    } else {
      const writePromise = writeContract(config, {
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        chainId: CHAIN_ID,
        args: [tradeExecutor, amount],
      });

      const result = await toastifyTx(() => writePromise, {
        txSent: { title: "Depositing token..." },
        txSuccess: { title: "Token deposited!" },
      });
      if (!result.status) {
        throw result.error;
      }
      return result;
    }
  }
}

export const useDepositToTradeExecutor = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: DepositProps) => depositToTradeExecutor(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
