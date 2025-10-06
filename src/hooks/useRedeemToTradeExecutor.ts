import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { queryClient } from "@/config/queryClient";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import {
  AI_PREDICTION_MARKET_ID,
  CHAIN_ID,
  COLLATERAL_TOKENS,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { writeContract } from "@wagmi/core";
import { Address, encodeFunctionData } from "viem";

interface RedeemProps {
  account: Address;
  tradeExecutor: Address;
  tokens: Address[];
  amounts: bigint[];
}

async function redeemToTradeExecutor({ tradeExecutor, tokens, amounts }: RedeemProps) {
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const calls = tokens.map((token, index) => {
    return {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amounts[index]],
      }),
    };
  });
  calls.push({
    to: router,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "redeemPositions",
      args: [
        collateral.address,
        AI_PREDICTION_MARKET_ID,
        tokens.map((_, index) => BigInt(index)),
        amounts,
      ],
    }),
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
    txSent: { title: "Redeeming tokens..." },
    txSuccess: { title: "Tokens redeemed!" },
  });
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useRedeemToTradeExecutor = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: RedeemProps) => redeemToTradeExecutor(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
