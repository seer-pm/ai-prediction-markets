import { UniswapGraphQLClient } from "@/config/apollo";
import {
  GetPoolsDocument,
  GetPoolsQuery,
  GetPoolsQueryVariables,
  OrderDirection,
  Pool_OrderBy,
} from "@/gql/graphql";
import { getToken0Token1 } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export async function getPools(tokenPairs: { token0: Address; token1: Address }[]) {
  const maxAttempts = 10;
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
        "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome",
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
          wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)) ?? [],
      ),
    );
    const { error: writeError } = await supabase
      .from("l2_pools")
      .upsert(pools.map((pool) => ({ id: pool.id, data: pool })));
    if (writeError) {
      throw writeError;
    }
  } catch (e: any) {
    console.log(e);
  }
};
