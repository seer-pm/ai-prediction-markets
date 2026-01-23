import { QuoterV2Abi } from "@/abis/QuoterV2Abi";
import { config } from "@/config/wagmi";
import { Token, QuoteTradeFn } from "@/types";
import { QUOTER_V2_ADDRESSES, SupportedChain } from "@/utils/constants";
import { Address, parseUnits } from "viem";
import { readContract } from "@wagmi/core";

// Common fee tiers in Uniswap V3
const FEES = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

/**
 * Fast quote function that uses QuoterV2 directly instead of AlphaRouter
 * Tests multiple fee tiers in parallel and returns the best result
 */
export const getUniswapQuoteFast: QuoteTradeFn = async (
  chainId: number,
  _account: Address | undefined,
  amount: string,
  outcomeToken: Token,
  collateralToken: Token,
  swapType: "buy" | "sell",
) => {
  // Validate that QuoterV2 is configured for this chain
  const quoterAddress = QUOTER_V2_ADDRESSES[chainId as SupportedChain];
  if (!quoterAddress) {
    throw new Error(`QuoterV2 not configured for chain ${chainId}`);
  }

  const [buyToken, sellToken] =
    swapType === "buy"
      ? [outcomeToken, collateralToken]
      : [collateralToken, outcomeToken];

  const sellAmount = parseUnits(String(amount), sellToken.decimals);
  const tokenIn = sellToken.address;
  const tokenOut = buyToken.address;

  // Test all fee tiers in parallel
  const quotePromises = FEES.map(async (fee) => {
    try {
      const result = await readContract(config, {
        address: quoterAddress,
        abi: QuoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            amountIn: sellAmount,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
        chainId,
      });

      return {
        fee,
        amountOut: result[0],
        gasEstimate: result[3],
        success: true,
      };
    } catch (error) {
      // Pool doesn't exist for this fee tier
      return { fee, amountOut: 0n, gasEstimate: 0n, success: false };
    }
  });

  const results = await Promise.all(quotePromises);
  
  // Find the best result (highest output)
  const validResults = results.filter((r) => r.success && r.amountOut > 0n);
  
  if (validResults.length === 0) {
    throw new Error("No route found");
  }

  const bestResult = validResults.reduce((best, current) =>
    current.amountOut > best.amountOut ? current : best
  );

  return {
    value: bestResult.amountOut,
    decimals: sellToken.decimals,
    buyToken: buyToken.address,
    sellToken: sellToken.address,
    sellAmount: sellAmount.toString(),
    swapType,
    fee: bestResult.fee,
    gasEstimate: bestResult.gasEstimate,
  };
};

