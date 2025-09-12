import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";
import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/utils";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);
const AI_PREDICTION_MARKET_ID = "0xb88275fe4e2494e04cea8fb5e9d913aa48add581";
const COLLATERAL = "0xb5b2dc7fd34c249f4be7fb1fcea07950784229e0";

export default async () => {
  try {
    const { data, error } = await supabase
      .from("markets")
      .select("subgraph_data->wrappedTokens,subgraph_data->outcomes")
      .eq("id", AI_PREDICTION_MARKET_ID)
      .single();
    if (!data) {
      throw { message: "Market not found" };
    }
    if (error) {
      throw error;
    }
    const wrappedTokens = data.wrappedTokens as Address[];
    const outcomes = data.outcomes as string[];

    //get pools for all the outcomes
    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      variables: {
        first: 1000,
        where: { or: wrappedTokens.map((token) => getToken0Token1(token, COLLATERAL)) },
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
    const repoToPriceMapping = (outcomes as string[]).reduce((mapping, outcome, index) => {
      const { token0, token1 } = getToken0Token1(wrappedTokens[index], COLLATERAL);
      const tokenPairMappingKey = `${token0}-${token1}`;
      const pool = tokenPairToPoolMapping[tokenPairMappingKey];
      if (!pool) {
        return mapping;
      }
      const { tick, ticks } = tokenPairToPoolMapping[tokenPairMappingKey];
      const [price0, price1] = tickToTokenPrices(Number(tick));
      const price = isTwoStringsEqual(wrappedTokens[index], token0) ? price0 : price1;
      mapping[outcome] = {
        price,
        ticks,
      };
      return mapping;
    }, {} as { [key: string]: { price: number; ticks: {} } });
    return new Response(JSON.stringify({ ...repoToPriceMapping }), {
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
