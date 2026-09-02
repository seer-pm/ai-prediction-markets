import { GetPoolsQuery } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID } from "@/utils/constants";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { getMarketStatus, MarketStatusInput } from "./utils/marketStatus";
import { createClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { Address } from "viem";

interface Market extends MarketStatusInput {
  wrappedTokens: Address[];
  collateralToken: Address;
  id: Address;
  outcomes: string[];
  parentOutcome: number;
  conditionId: Address;
}

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export async function getPools() {
  const pageSize = 1000;
  const { count, error: countError } = await supabase
    .from("l2_pools")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;
  if (!count) return [];

  const pageCount = Math.ceil(count / pageSize);
  const limit = pLimit(5);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      limit(async () => {
        const from = i * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase.from("l2_pools").select("data").range(from, to);
        if (error) throw error;
        return data ?? [];
      }),
    ),
  );

  return pages.flat().map((row) => row.data);
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
        .select(
          "subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutReported,subgraph_data->conditionId,subgraph_data->questions",
        )
        .eq("id", L2_PARENT_MARKET_ID)
        .eq("chain_id", CHAIN_ID)
        .single(),
      supabase
        .from("markets")
        .select(
          "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->payoutReported,subgraph_data->conditionId,subgraph_data->questions",
        )
        .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
        .ilike("subgraph_data->>marketName", "%What will be the average weight of%")
        .eq("chain_id", CHAIN_ID),
    ]);
    if (parentMarketError) {
      throw parentMarketError;
    }
    if (!parentMarket) {
      throw new Error("Parent market not found");
    }
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Markets not found");
    }

    const markets = (data as Market[]).map((market) => ({
      ...market,
      marketStatus: getMarketStatus(market),
    }));
    const pools = await getPools();
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
      const [price0, price1] =
        pool.tick === null || pool.tick === undefined ? [0, 0] : tickToTokenPrices(Number(tick));
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

    // return ticks data and current price
    const repoToPriceMapping = markets.reduce(
      (mapping, market) => {
        const pools = market.wrappedTokens
          .slice(0, -1)
          .map((token) => getPoolByTokenPair(token, market.collateralToken));
        const repo = (parentMarket.outcomes as string[])[market.parentOutcome];

        mapping[repo] = {
          id: market.id,
          pools,
          prices: pools.map((pool) => pool?.price ?? null),
        };
        return mapping;
      },
      {} as {
        [key: string]: { id: Address; pools: (PoolInfo | null)[]; prices: (number | null)[] };
      },
    );
    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        markets,
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
