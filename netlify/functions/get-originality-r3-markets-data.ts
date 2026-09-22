import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { ORIGINALITY_R3_MARKETS } from "@/utils/originalityR3Markets";
import { Address } from "viem";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import {
  fetchOriginalityR3MarketsOnChain,
  fetchOriginalityR3ParentOnChain,
} from "./utils/originalityR3OnChain";

/**
 * Prices for the 98 round-3 Originality markets, in the same response shape as
 * `get-originality-markets-data` so the tab and its hooks serve both rounds unchanged.
 *
 * Two things differ from round 2, and both are forced by the chain:
 *  - The markets come from MarketView, not Supabase — the set postdates Seer's indexer stall.
 *  - The repo is NOT `parent.outcomes[parentOutcome]`. The round-3 parent is a 3-outcome
 *    multi-scalar ("Bundle A/B/C"), so ~33 markets share each parent outcome; keying on it would
 *    collapse 98 rows into 3. The repo comes from `ORIGINALITY_R3_MARKETS` instead, which was
 *    generated from the creation log and pairs each market address with its repo.
 */
export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    const [parent, markets] = await Promise.all([
      fetchOriginalityR3ParentOnChain(),
      fetchOriginalityR3MarketsOnChain(),
    ]);

    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      // The shared client caches cache-first for the life of a warm instance, which would keep
      // serving the pre-seed "no pools" answer after the pools exist. Prices must be live.
      fetchPolicy: "no-cache",
      variables: {
        first: 1000,
        where: {
          // Each pool pairs DOWN or UP with the market's own collateral, its bundle token.
          or: markets.flatMap(({ wrappedTokens, collateralToken }) =>
            wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)),
          ),
        },
      },
    });
    // A transport failure, not an empty result: an unseeded set must fall through to null prices.
    if (!queryResult.data) {
      throw new Error("Pool query failed");
    }

    // we only use the pool with highest liquidity for each pair
    const tokenPairToPoolMapping = queryResult.data.pools.reduce(
      (acc, pool) => {
        const mappingKey = `${pool.token0.id}-${pool.token1.id}`;
        if (!acc[mappingKey] || Number(pool.liquidity) > Number(acc[mappingKey].liquidity)) {
          acc[mappingKey] = pool;
        }
        return acc;
      },
      {} as { [key: string]: GetPoolsQuery["pools"][0] },
    );

    const getPoolByTokenPair = (outcome: Address, collateral: Address): (PoolInfo & { price: number }) | null => {
      const { token0, token1 } = getToken0Token1(outcome, collateral);
      const pool = tokenPairToPoolMapping[`${token0}-${token1}`];
      if (!pool) return null;
      const [price0, price1] = tickToTokenPrices(Number(pool.tick));
      return {
        liquidity: pool.liquidity,
        tick: pool.tick,
        token0: pool.token0.id,
        token1: pool.token1.id,
        ticks: pool.ticks,
        feeTier: pool.feeTier,
        price: isTwoStringsEqual(outcome, token0) ? price0 : price1,
      };
    };

    const repoToPriceMapping: {
      [repo: string]: {
        id: Address;
        upPrice: number | null;
        downPrice: number | null;
        upPool: PoolInfo | null;
        downPool: PoolInfo | null;
      };
    } = {};
    // `fetchOriginalityR3MarketsOnChain` returns markets in `ORIGINALITY_R3_MARKETS` order.
    markets.forEach((market, index) => {
      const entry = ORIGINALITY_R3_MARKETS[index];
      if (!entry || !isTwoStringsEqual(entry.address, market.id)) {
        throw new Error(`market ${market.id} does not match ORIGINALITY_R3_MARKETS[${index}]`);
      }
      // wrappedTokens order is [DOWN, UP, Invalid].
      const downPool = getPoolByTokenPair(market.wrappedTokens[0], market.collateralToken);
      const upPool = getPoolByTokenPair(market.wrappedTokens[1], market.collateralToken);
      repoToPriceMapping[entry.repo] = {
        id: market.id,
        upPrice: upPool?.price ?? null,
        upPool,
        downPrice: downPool?.price ?? null,
        downPool,
      };
    });

    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        markets: markets.map(({ id, wrappedTokens, collateralToken, parentOutcome, marketStatus }) => ({
          id,
          wrappedTokens,
          collateralToken,
          parentOutcome,
          marketStatus,
        })),
        parentWrappedTokens: parent.wrappedTokens,
      }),
      {
        status: 200,
        headers: {
          ...EDGE_CACHE_HEADERS,
          ...corsHeaders,
        },
      },
    );
  } catch (e: unknown) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
};
