import { GetPoolsQuery } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export async function getPools() {
  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;
  let allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase.from("l2_pools").select("data").range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);

    from += pageSize;
    to += pageSize;
  }

  return allRows.map((row) => row.data);
}

export default async () => {
  try {
    const { data: parentMarket, error: parentMarketError } = await supabase
      .from("markets")
      .select("subgraph_data->wrappedTokens,subgraph_data->outcomes")
      .eq("id", L2_PARENT_MARKET_ID)
      .eq("chain_id", CHAIN_ID)
      .single();
    if (parentMarketError) {
      throw parentMarketError;
    }
    if (!parentMarket) {
      throw new Error("Parent market not found");
    }

    let { data, error } = await supabase
      .from("markets")
      .select(
        "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome",
      )
      .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
      .eq("chain_id", CHAIN_ID);
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Markets not found");
    }

    const markets = data as {
      wrappedTokens: Address[];
      collateralToken: Address;
      id: Address;
      outcomes: string[];
      parentOutcome: number;
    }[];

    //get pools for all the markets
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
    return new Response(JSON.stringify({ marketsData: repoToPriceMapping, markets }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "http://localhost:5173",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (e: any) {
    console.log(e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
