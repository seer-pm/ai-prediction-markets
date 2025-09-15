import { UniswapRouterAbi } from "@/abis/UniswapRouterAbi";
import { Execution } from "@/hooks/useCheck7702Support";
import { ApprovalRequest } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { NATIVE_TOKEN, SupportedChain } from "@/utils/constants";
import { Trade, UniswapTrade } from "@swapr/sdk";
import {
  Address,
  decodeFunctionData,
  DecodeFunctionDataReturnType,
  encodeFunctionData,
  erc20Abi,
} from "viem";

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
        const decodedMulticall = decodeFunctionData({
          abi: UniswapRouterAbi,
          data: callData as `0x${string}`,
        }) as DecodeFunctionDataReturnType<typeof UniswapRouterAbi, "multicall">;

        // Decode the exactInputSingle/exactOutputSingle function data
        const decodedRouter = decodeFunctionData({
          abi: UniswapRouterAbi,
          data: decodedMulticall.args[1]?.[0] as `0x${string}`,
        });
        let callDataAmountIn: bigint;
        if (decodedRouter.functionName === "exactInputSingle") {
          callDataAmountIn = decodedRouter.args[0].amountIn;
        } else if (decodedRouter.functionName === "exactOutputSingle") {
          callDataAmountIn = decodedRouter.args[0].amountInMaximum;
        } else {
          throw new Error(`Unexpected router function: ${decodedRouter.functionName}`);
        }

        maximumAmountIn = callDataAmountIn > maximumAmountIn ? callDataAmountIn : maximumAmountIn;
      } catch (e) {
        console.log(e);
      }
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
