import { gnosis } from "viem/chains";
import type { MarketDataMapping, SupportedChain, TransactionData } from "@seer-pm/sdk";
import { getTokensPairKey } from "@seer-pm/sdk/market-pools";
import { swaprGraphQLClient, uniswapGraphQLClient } from "@seer-pm/sdk/subgraph";
import { type GetSwapsQuery, OrderDirection, Swap_OrderBy, getSdk as getSwaprSdk } from "@seer-pm/sdk/subgraph/swapr";
import { getSdk as getUniswapSdk } from "@seer-pm/sdk/subgraph/uniswap";
import { type Address, parseUnits } from "viem";
import { getCollateralFromDexTx } from "../markets";
import { type EventFetchOptions, hitLimit, paginateByTimestampId } from "./subgraphTimestampIdPagination";

/**
 * Ported from Seer's `netlify/functions/utils/transactions/getSwapEvents.ts`, minus the CoW
 * Protocol leg.
 *
 * Deep markets are Optimism-only and every trade goes through Uniswap v3 (see
 * `src/lib/trade`), and upstream already short-circuits CoW on chains with no order book host.
 * Dropping it also drops the `@cowprotocol/cow-sdk` and `@netlify/blobs` dependencies, which
 * nothing else in this graph uses.
 */

async function fetchSwapsFromSubgraph(
  account: string,
  chainId: SupportedChain,
  startTime?: number,
  endTime?: number,
  maxRows?: number,
) {
  const graphQLClient = chainId === gnosis.id ? swaprGraphQLClient(chainId, "algebra") : uniswapGraphQLClient(chainId);

  if (!graphQLClient) {
    throw new Error("Subgraph not available");
  }

  const graphQLSdk = chainId === gnosis.id ? getSwaprSdk : getUniswapSdk;
  const accountLc = account.toLowerCase() as Address;

  // Single stream: origin OR recipient, with (timestamp, id) cursor via shared helper.
  return paginateByTimestampId<GetSwapsQuery["swaps"][number]>({
    startTime,
    endTime,
    maxRows,
    accountFilters: [{ origin: accountLc }, { recipient: accountLc }],
    fetchPage: async (where, first) => {
      const data = await graphQLSdk(graphQLClient).GetSwaps({
        first,
        orderBy: Swap_OrderBy.Timestamp as any,
        orderDirection: OrderDirection.Desc as any,
        where: where as any,
      });
      return data.swaps as GetSwapsQuery["swaps"];
    },
  });
}

export async function getSwapEvents(
  mappings: MarketDataMapping,
  account: Address,
  chainId: SupportedChain,
  startTime?: number,
  endTime?: number,
  options?: EventFetchOptions,
) {
  const { outcomeTokenToCollateral, tokenPairToMarketMapping } = mappings;
  if (outcomeTokenToCollateral.size === 0) {
    return [];
  }

  const dexSwaps = await fetchSwapsFromSubgraph(account, chainId, startTime, endTime, options?.limit);
  if (options && hitLimit(dexSwaps, options.limit)) options.truncated = true;

  return dexSwaps.reduce((acc, swap) => {
    const amount0 = parseUnits(swap.amount0.replace("-", ""), Number(swap.token0.decimals));
    const amount1 = parseUnits(swap.amount1.replace("-", ""), Number(swap.token1.decimals));
    const tokenIn = Number(swap.amount1) < 0 ? swap.token0.id : swap.token1.id;
    const tokenOut = Number(swap.amount1) < 0 ? swap.token1.id : swap.token0.id;
    const market = tokenPairToMarketMapping[getTokensPairKey(tokenIn, tokenOut)];
    if (market) {
      acc.push({
        tokenIn,
        tokenOut,
        amountIn: tokenIn.toLocaleLowerCase() > tokenOut.toLocaleLowerCase() ? amount1.toString() : amount0.toString(),
        amountOut: tokenIn.toLocaleLowerCase() > tokenOut.toLocaleLowerCase() ? amount0.toString() : amount1.toString(),
        tokenInSymbol:
          tokenIn.toLocaleLowerCase() > tokenOut.toLocaleLowerCase() ? swap.token1.symbol : swap.token0.symbol,
        tokenOutSymbol:
          tokenIn.toLocaleLowerCase() > tokenOut.toLocaleLowerCase() ? swap.token0.symbol : swap.token1.symbol,
        blockNumber: Number(swap.transaction.blockNumber),
        timestamp: Number(swap.timestamp),
        marketName: market.marketName,
        marketId: market.id,
        type: "swap",
        collateral: getCollateralFromDexTx(market, tokenIn as Address, tokenOut as Address),
        transactionHash: swap.transaction.id,
      });
    }
    return acc;
  }, [] as TransactionData[]);
}
