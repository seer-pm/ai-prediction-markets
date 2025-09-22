import { erc20Abi } from "@/abis/erc20Abi";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { CHAIN_ID } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { writeContract } from "@wagmi/core";
import { Address, encodeFunctionData } from "viem";

interface WithdrawProps {
  account: Address;
  tradeExecutor: Address;
  tokens: Address[];
  amounts: bigint[];
}

async function withdrawFromTradeExecutor({
  account,
  tradeExecutor,
  tokens,
  amounts,
}: WithdrawProps) {
  const calls = tokens.map((token, index) => {
    return {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [account, amounts[index]],
      }),
    };
  });
  const writePromise = writeContract(config, {
    address: tradeExecutor,
    abi: TradeExecutorAbi,
    functionName: "batchExecute",
    args: [calls],
    value: 0n,
    chainId: CHAIN_ID,
  });

  const result = await toastifyTx(() => writePromise, {
    txSent: { title: "Withdrawing token..." },
    txSuccess: { title: "Token withdrawn!" },
  });
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useWithdrawFromTradeExecutor = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: WithdrawProps) => withdrawFromTradeExecutor(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
