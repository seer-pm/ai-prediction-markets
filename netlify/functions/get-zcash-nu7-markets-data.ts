import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { getZcashNu7Market, invalidIndexOf } from "@/utils/zcashNu7Markets";
import { Address } from "viem";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { fetchZcashNu7MarketsOnChain } from "./utils/zcashNu7OnChain";

/**
 * Prices for the 5 Zcash NU7 poll markets.
 *
 * Structurally this is `get-zcash-markets-data` with the yes/no pair generalised to an outcome
 * array: these are categorical markets whose outcome count differs per question, so nothing may
 * index by literal. The response is keyed by market address rather than by title — the grants tab
 * needs a title key to join a predictions CSV, this tab has no CSV to join.
 */
export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    const markets = await fetchZcashNu7MarketsOnChain();

    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      variables: {
        first: 1000,
        where: {
          // Invalid is never seeded with liquidity, and it is always the last outcome.
          or: markets.flatMap(({ wrappedTokens, collateralToken }) =>
            wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)),
          ),
        },
      },
    });

    // A transport failure, not an empty result: an unseeded set is a legitimate answer and must
    // fall through to null prices rather than throwing.
    if (!queryResult.data) {
      throw { message: "Pool query failed" };
    }

    const pools = queryResult.data.pools;
    // we only use the pool with highest liquidity for each pair
    const tokenPairToPoolMapping = pools.reduce(
      (acc, pool) => {
        const numLiquidity = Number(pool.liquidity);
        const mappingKey = `${pool.token0.id}-${pool.token1.id}`;
        if (!acc[mappingKey] || numLiquidity > Number(acc[mappingKey].liquidity)) {
          acc[mappingKey] = pool;
        }
        return acc;
      },
      {} as { [key: string]: GetPoolsQuery["pools"][0] },
    );

    const getPoolByTokenPair = (outcome: Address, collateral: Address) => {
      const { token0, token1 } = getToken0Token1(outcome, collateral);
      const tokenPairMappingKey = `${token0}-${token1}`;
      const pool = tokenPairToPoolMapping[tokenPairMappingKey];
      if (!pool) return null;
      const {
        tick,
        ticks,
        liquidity,
        feeTier,
        token0: { id: poolToken0Id },
        token1: { id: poolToken1Id },
      } = pool;
      const [price0, price1] = tickToTokenPrices(Number(tick));
      const price = isTwoStringsEqual(outcome, token0) ? price0 : price1;
      return { liquidity, tick, token0: poolToken0Id, token1: poolToken1Id, ticks, feeTier, price };
    };

    const marketsWithPrices = markets.map((market) => {
      // Per outcome, in on-chain order, so `prices[i]` / `pools[i]` line up with `outcomes[i]` and
      // `wrappedTokens[i]`. Invalid resolves to null on both, having no pool.
      const invalidIndex = invalidIndexOf(market.wrappedTokens);
      const outcomePools = market.wrappedTokens.map((token, index) =>
        index === invalidIndex ? null : getPoolByTokenPair(token, market.collateralToken),
      );
      const ballot = getZcashNu7Market(market.id);
      return {
        ...market,
        shortName: ballot?.shortName ?? "",
        topic: ballot?.topic ?? "",
        prices: outcomePools.map((pool) => pool?.price ?? null),
        pools: outcomePools as (PoolInfo | null)[],
      };
    });

    return new Response(JSON.stringify({ markets: marketsWithPrices }), {
      status: 200,
      headers: {
        ...EDGE_CACHE_HEADERS,
        ...corsHeaders,
      },
    });
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
