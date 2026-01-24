import { Execution } from "@/hooks/useCheck7702Support";
import { ApprovalRequest, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { NATIVE_TOKEN, UNISWAP_ROUTER_ADDRESSES, CHAIN_ID } from "@/utils/constants";
import {
  Address,
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

export function getTradeApprovals7702(account: Address, quote: UniswapQuoteTradeResult) {
  return getApprovals7702({
    tokensAddresses: [quote.sellToken],
    account,
    spender: UNISWAP_ROUTER_ADDRESSES[CHAIN_ID],
    amounts: BigInt(quote.sellAmount),
    chainId: CHAIN_ID,
  });
}
