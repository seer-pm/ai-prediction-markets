import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, ORIGINALITY_PARENT_MARKET_ID } from "@/utils/constants";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { getMarketStatus, MarketStatusInput } from "./utils/marketStatus";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

interface Market extends MarketStatusInput {
  wrappedTokens: Address[];
  collateralToken: Address;
  id: Address;
  outcomes: string[];
  parentOutcome: number;
  conditionId: Address;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    // Parent market and child markets are independent queries — fetch them concurrently.
    const [
      { data: parentMarket, error: parentMarketError },
      { data, error },
    ] = await Promise.all([
      supabase
        .from("markets")
        .select("subgraph_data->wrappedTokens,subgraph_data->outcomes")
        .eq("id", ORIGINALITY_PARENT_MARKET_ID)
        .eq("chain_id", CHAIN_ID)
        .single(),
      supabase
        .from("markets")
        .select(
          "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->payoutReported,subgraph_data->conditionId,subgraph_data->questions",
        )
        .eq("subgraph_data->parentMarket->>id", ORIGINALITY_PARENT_MARKET_ID)
        .eq("chain_id", CHAIN_ID),
    ]);
    if (parentMarketError) {
      throw parentMarketError;
    }
    if (!parentMarket) {
      throw new Error("Parent market not found");
    }
    if (!data) {
      throw new Error("Markets not found");
    }
    if (error) {
      throw error;
    }
    const markets = (data as Market[]).map((market) => ({
      ...market,
      marketStatus: getMarketStatus(market),
    }));
    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      variables: {
        first: 1000,
        where: {
          or: markets.flatMap(
            ({ wrappedTokens, collateralToken }) =>
              wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)) ??
              [],
          ),
        },
      },
    });
    if (!queryResult.data) {
      throw { message: "No pool found" };
    }
    const pools = queryResult.data.pools;
    //we only use the pool with highest liquidity for each pair
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
      return {
        liquidity,
        tick,
        token0: poolToken0Id,
        token1: poolToken1Id,
        ticks,
        feeTier,
        price,
      };
    };

    // return ticks data and current down/up price
    const repoToPriceMapping = markets.reduce(
      (mapping, market) => {
        const downPool = getPoolByTokenPair(market.wrappedTokens[0], market.collateralToken);
        const upPool = getPoolByTokenPair(market.wrappedTokens[1], market.collateralToken);
        const repo = (parentMarket.outcomes as string[])[market.parentOutcome];
        if (mapping[repo]?.upPool || mapping[repo]?.downPool) {
          return mapping;
        }
        mapping[repo] = {
          id: market.id,
          upPrice: upPool?.price ?? null,
          upPool,
          downPrice: downPool?.price ?? null,
          downPool,
        };
        return mapping;
      },
      {} as {
        [key: string]: {
          id: Address;
          upPrice: number | null;
          downPrice: number | null;
          upPool: PoolInfo | null;
          downPool: PoolInfo | null;
        };
      },
    );
    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        markets,
        parentWrappedTokens: parentMarket.wrappedTokens,
      }),
      {
        status: 200,
        headers: {
          ...EDGE_CACHE_HEADERS,
          ...corsHeaders,
        },
      },
    );
  } catch (e: any) {
    console.log(e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
};
