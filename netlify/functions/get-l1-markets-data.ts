import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";
import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { PoolInfo } from "@/types";
import { L1_MARKET_ID, CHAIN_ID, COLLATERAL_TOKENS } from "@/utils/constants";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export default async () => {
  try {
    const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;
    const { data, error } = await supabase
      .from("markets")
      .select(
        "subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators"
      )
      .eq("id", L1_MARKET_ID)
      .single();
    if (!data) {
      throw { message: "Market not found" };
    }
    if (error) {
      throw error;
    }
    const { data: otherMarketData, error: otherMarketError } = await supabase
      .from("markets")
      .select(
        "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators"
      )
      .eq("subgraph_data->parentMarket->>id", L1_MARKET_ID)
      .single();
    if (!otherMarketData) {
      throw { message: "Other market not found" };
    }
    if (otherMarketError) {
      throw otherMarketError;
    }
    const wrappedTokens = (data.wrappedTokens as Address[]).concat(
      otherMarketData.wrappedTokens as Address
    );
    const outcomesByMarket = (data.outcomes as string[])
      .map((outcome) => ({ outcome, marketId: L1_MARKET_ID }))
      .concat(
        (otherMarketData.outcomes as string[]).map((outcome) => ({
          outcome,
          marketId: otherMarketData.id,
        }))
      );

    //get pools for all the outcomes
    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      variables: {
        first: 1000,
        where: { or: wrappedTokens.map((token) => getToken0Token1(token, collateral)) },
      },
    });
    
    if (!queryResult.data) {
      throw { message: "No pool found" };
    }

    const pools = queryResult.data.pools;
    //we only use the pool with highest liquidity for each pair
    const tokenPairToPoolMapping = pools.reduce((acc, pool) => {
      const numLiquidity = Number(pool.liquidity);
      const mappingKey = `${pool.token0.id}-${pool.token1.id}`;
      if (!acc[mappingKey] || numLiquidity > Number(acc[mappingKey].liquidity)) {
        acc[mappingKey] = pool;
      }
      return acc;
    }, {} as { [key: string]: GetPoolsQuery["pools"][0] });
    // return ticks data and current price
    const repoToPriceMapping = outcomesByMarket.reduce((mapping, { outcome, marketId }, index) => {
      const { token0, token1 } = getToken0Token1(wrappedTokens[index], collateral);
      const tokenPairMappingKey = `${token0}-${token1}`;
      const pool = tokenPairToPoolMapping[tokenPairMappingKey];
      if (!pool) {
        mapping[outcome] = {
          id: wrappedTokens[index],
          marketId,
          price: null,
          pool: null,
        };
        return mapping;
      }
      const {
        tick,
        ticks,
        liquidity,
        token0: { id: poolToken0Id },
        token1: { id: poolToken1Id },
      } = tokenPairToPoolMapping[tokenPairMappingKey];
      const [price0, price1] = tickToTokenPrices(Number(tick));
      const price = isTwoStringsEqual(wrappedTokens[index], token0) ? price0 : price1;
      mapping[outcome] = {
        id: wrappedTokens[index],
        marketId,
        price,
        pool: {
          liquidity,
          tick,
          token0: poolToken0Id,
          token1: poolToken1Id,
          ticks,
        },
      };
      return mapping;
    }, {} as { [key: string]: { id: Address; price: number | null; pool: PoolInfo | null; marketId: string } });
    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        wrappedTokens,
        payoutNumerators: data.payoutNumerators,
      }),
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "http://localhost:5173",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET",
        },
      }
    );
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
