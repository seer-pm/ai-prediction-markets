import { erc20Abi } from "@/abis/erc20Abi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifySendCallsTx, toastifyTx } from "@/lib/toastify";
import { CHAIN_ID, collateral, PSM3_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { getAccount, writeContract } from "@wagmi/core";
import { Address, encodeFunctionData } from "viem";
import { Execution } from "./useCheck7702Support";
import { PSM3Abi } from "@/abis/PSM3Abi";

interface SupplyProps {
  asset: Address;
  amount: bigint;
  convertAmount: bigint;
  use7702: boolean;
}

async function supplyAsset({ asset, amount, convertAmount, use7702 }: SupplyProps) {
  const account = getAccount(config).address;
  const calls: Execution[] = [];
  if (use7702) {
    calls.push({
      to: asset,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PSM3_ADDRESSES[CHAIN_ID], amount],
      }),
    });

    calls.push({
      to: PSM3_ADDRESSES[CHAIN_ID],
      value: 0n,
      data: encodeFunctionData({
        abi: PSM3Abi,
        functionName: "swapExactIn",
        args: [asset, collateral.address, amount, convertAmount, account, 0n],
      }),
    });
    const result = await toastifySendCallsTx(calls, config, {
      txSent: { title: "Converting to sUSDS..." },
      txSuccess: { title: "Tokens converted!" },
    });
    if (!result.status) {
      throw result.error;
    }
    return result;
  } else {
    const approveResult = await toastifyTx(
      () =>
        writeContract(config, {
          address: asset,
          abi: erc20Abi,
          functionName: "approve",
          chainId: CHAIN_ID,
          args: [PSM3_ADDRESSES[CHAIN_ID], amount],
        }),
      {
        txSent: { title: "Approving tokens..." },
        txSuccess: { title: "Tokens approved!" },
      },
    );
    if (!approveResult.status) {
      throw approveResult.error;
    }
    const result = await toastifyTx(
      () =>
        writeContract(config, {
          address: PSM3_ADDRESSES[CHAIN_ID],
          abi: PSM3Abi,
          functionName: "swapExactIn",
          chainId: CHAIN_ID,
          args: [asset, collateral.address, amount, convertAmount, account, 0n],
        }),
      {
        txSent: { title: "Converting to sUSDS..." },
        txSuccess: { title: "Tokens converted!" },
      },
    );
    if (!result.status) {
      throw result.error;
    }
    return result;
  }
}

export const useSupplyAsset = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: SupplyProps) => supplyAsset(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
