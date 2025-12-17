import { UniswapGraphQLClient } from "@/config/apollo";
import {
  GetPoolsDocument,
  GetPoolsQuery,
  GetPoolsQueryVariables,
  OrderDirection,
  Pool_OrderBy,
} from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export async function getPools(tokenPairs: { token0: Address; token1: Address }[]) {
  const maxAttempts = 5;
  let attempt = 0;
  let id = undefined;
  let total: GetPoolsQuery["pools"] = [];
  while (attempt < maxAttempts) {
    const queryResult: { data: GetPoolsQuery | undefined } = await UniswapGraphQLClient.query<
      GetPoolsQuery,
      GetPoolsQueryVariables
    >({
      query: GetPoolsDocument,
      variables: {
        first: 1000,
        where: {
          and: [
            {
              or: tokenPairs,
            },
            { id_lt: id },
          ],
        },
        orderBy: Pool_OrderBy.Id,
        orderDirection: OrderDirection.Desc,
      },
    });
    if (!queryResult.data) {
      throw { message: "No pool found" };
    }
    const pools = queryResult.data.pools;
    total = total.concat(pools);
    if (pools[pools.length - 1]?.id === id) {
      break;
    }
    if (pools.length < 1000) {
      break;
    }
    id = pools[pools.length - 1]?.id;
    attempt++;
  }
  return total;
}

export default async () => {
  try {
    const { data: parentMarket, error: parentMarketError } = await supabase
      .from("markets")
      .select("subgraph_data->wrappedTokens,subgraph_data->outcomes")
      .eq("id", L2_PARENT_MARKET_ID)
      .single();
    if (!parentMarket) {
      throw new Error("Parent market not found");
    }
    if (parentMarketError) {
      throw parentMarketError;
    }
    let { data, error } = await supabase
      .from("markets")
      .select(
        "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome"
      )
      .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
      .eq("chain_id", CHAIN_ID);
    if (!data) {
      throw new Error("Markets not found");
    }
    if (error) {
      throw error;
    }
    const markets = data as {
      wrappedTokens: Address[];
      collateralToken: Address;
      id: Address;
      outcomes: string[];
      parentOutcome: number;
    }[];

    //get pools for all the markets
    const pools = await getPools(
      markets.flatMap(
        ({ wrappedTokens, collateralToken }) =>
          wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)) ?? []
      )
    );
    //we only use the pool with highest liquidity for each pair
    const tokenPairToPoolMapping = pools.reduce((acc, pool) => {
      const numLiquidity = Number(pool.liquidity);
      const mappingKey = `${pool.token0.id}-${pool.token1.id}`;
      if (!acc[mappingKey] || numLiquidity > Number(acc[mappingKey].liquidity)) {
        acc[mappingKey] = pool;
      }
      return acc;
    }, {} as { [key: string]: GetPoolsQuery["pools"][0] });

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
      const [price0, price1] = tickToTokenPrices(Number(tick));
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
    const repoToPriceMapping = markets.reduce((mapping, market) => {
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
    }, {} as { [key: string]: { id: Address; pools: (PoolInfo | null)[]; prices: (number | null)[] } });
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
