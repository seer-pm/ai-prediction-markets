import { erc20Abi } from "@/abis/erc20Abi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { noteSentBlock, toastifySendCallsTx, toastifyTx } from "@/lib/toastify";
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

/**
 * Moves tokens from the connected wallet into the trade wallet: one `transfer` per token, signed
 * by the user. A wallet that batches signs them `TRANSFERS_PER_CONFIRMATION` at a time; any other
 * signs each one.
 *
 * Every transfer is sent. The non-batched path used to `return` inside its loop, so a deposit of
 * several tokens moved the first and reported success. The batched path built its calls and never
 * sent them.
 */
export async function depositToTradeExecutor({
  tradeExecutor,
  tokens,
  amounts,
  use7702,
}: DepositProps) {
  const calls: Execution[] = tokens.map((token, i) => ({
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [tradeExecutor, amounts[i]],
    }),
  }));

  if (use7702) {
    const result = await toastifySendCallsTx(calls, config, {
      txSent: { title: "Depositing tokens..." },
      txSuccess: { title: "Tokens deposited!" },
    });
    if (!result.status) {
      throw result.error;
    }
    // So a balance read that follows waits for a node that has seen these transfers.
    noteSentBlock(result.receipt);
    return result;
  }

  let last: Awaited<ReturnType<typeof toastifyTx>> | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const result = await toastifyTx(
      () =>
        writeContract(config, {
          address: tokens[i],
          abi: erc20Abi,
          functionName: "transfer",
          chainId: CHAIN_ID,
          args: [tradeExecutor, amounts[i]],
        }),
      {
        txSent: {
          title: "Depositing token...",
          subtitle: tokens.length > 1 ? `${i + 1} of ${tokens.length}` : undefined,
        },
        txSuccess: { title: "Token deposited!" },
      },
    );
    if (!result.status) {
      throw result.error;
    }
    noteSentBlock(result.receipt);
    last = result;
  }
  return last;
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
