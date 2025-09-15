import { UniswapRouterAbi } from "@/abis/UniswapRouterAbi";
import { Execution } from "@/hooks/useCheck7702Support";
import { ApprovalRequest } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { NATIVE_TOKEN, SupportedChain } from "@/utils/constants";
import { Trade, TradeType, UniswapTrade } from "@swapr/sdk";
import { Address, encodeFunctionData, decodeFunctionData, erc20Abi } from "viem";

export function getApprovals7702({ tokensAddresses, spender, amounts }: ApprovalRequest) {
  const calls: Execution[] = [];

  if (!tokensAddresses.length) {
    return calls;
  }

  if (Array.isArray(amounts) && tokensAddresses.length !== amounts.length) {
    throw new Error("Invalid tokens and amounts lengths");
  }

  for (let i = 0; i < tokensAddresses.length; i++) {
    if (isTwoStringsEqual(tokensAddresses[i], NATIVE_TOKEN)) {
      continue;
    }

    const amount = typeof amounts === "bigint" ? amounts : amounts[i];
    calls.push({
      to: tokensAddresses[i],
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
    });
  }

  return calls;
}

export function getMaximumAmountIn(trade: Trade) {
  let maximumAmountIn = BigInt(trade.maximumAmountIn().raw.toString());

  if (trade instanceof UniswapTrade) {
    const callData = trade.swapRoute.methodParameters?.calldata;

    if (callData) {
      try {
        // Decode the multicall function data
        const decodedMulticall: any = decodeFunctionData({
          abi: UniswapRouterAbi,
          data: callData as `0x${string}`,
        });

        // Decode the exactInputSingle/exactOutputSingle function data
        const decodedRouter: any = decodeFunctionData({
          abi: UniswapRouterAbi,
          data: decodedMulticall.args[1][0] as `0x${string}`,
        });

        const callDataAmountIn =
          trade.tradeType === TradeType.EXACT_INPUT
            ? BigInt(decodedRouter.args![0][4].toString()) // amountIn
            : BigInt(decodedRouter.args![0][5].toString()); // maximumAmountIn

        maximumAmountIn = callDataAmountIn > maximumAmountIn ? callDataAmountIn : maximumAmountIn;
      } catch {}
    }
  }

  return maximumAmountIn;
}

export function getTradeApprovals7702(account: Address, trade: Trade) {
  return getApprovals7702({
    tokensAddresses: [trade.executionPrice.baseCurrency.address as `0x${string}`],
    account,
    spender: trade.approveAddress as `0x${string}`,
    amounts: getMaximumAmountIn(trade),
    chainId: trade.chainId as SupportedChain,
  });
}
