import { sendTransaction } from "@wagmi/core";
import { Address, TransactionReceipt, encodeFunctionData } from "viem";
import { Execution } from "../../hooks/useCheck7702Support";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { UniswapQuoteTradeResult } from "@/types";
import { UNISWAP_ROUTER_ADDRESSES, CHAIN_ID } from "@/utils/constants";

// Minimal SwapRouter ABI for exactInputSingle
const SwapRouterAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export async function executeUniswapTrade(
  quote: UniswapQuoteTradeResult,
  account: Address,
  slippagePercent: number = 0.5 // 0.5% slippage by default
): Promise<TransactionReceipt> {
  const result = await toastifyTx(
    async () => sendTransaction(config, getUniswapTradeExecution(quote, account, slippagePercent)),
    {
      txSent: { title: "Executing trade..." },
      txSuccess: { title: "Trade executed!" },
    }
  );

  if (!result.status) {
    throw result.error;
  }

  return result.receipt;
}

export function getUniswapTradeExecution(
  quote: UniswapQuoteTradeResult,
  account: Address,
  slippagePercent: number = 0.5
): Execution {
  // Calculate amountOutMinimum with slippage
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const amountOutMinimum = (quote.value * (10000n - slippageBps)) / 10000n;

  const data = encodeFunctionData({
    abi: SwapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: quote.sellToken,
        tokenOut: quote.buyToken,
        fee: quote.fee,
        recipient: account,
        amountIn: BigInt(quote.sellAmount),
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return {
    to: UNISWAP_ROUTER_ADDRESSES[CHAIN_ID],
    data,
    value: 0n,
  };
}
