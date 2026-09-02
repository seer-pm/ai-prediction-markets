import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, COLLATERAL_TOKENS, L1_MARKET_ID, OTHER_MARKET_ID } from "@/utils/constants";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { fetchMarketsOnChain } from "./utils/marketView";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;
    // Parent market and child market are independent — fetch concurrently.
    const [
      { data, error },
      { data: otherMarketData, error: otherMarketError },
      [onChainParent, onChainOther],
    ] = await Promise.all([
      supabase
        .from("markets")
        .select(
          "subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators",
        )
        .eq("id", L1_MARKET_ID)
        .eq("chain_id", CHAIN_ID)
        .single(),
      supabase
        .from("markets")
        .select(
          "id,subgraph_data->wrappedTokens,subgraph_data->blockTimestamp,subgraph_data->outcomes,subgraph_data->payoutNumerators",
        )
        .eq("subgraph_data->parentMarket->>id", L1_MARKET_ID)
        .eq("chain_id", CHAIN_ID)
        .single(),
      // Resolution state comes from the chain, not Supabase. Seer's indexer stalled on Optimism at
      // block 156,195,946 (2026-08-29) and never saw these markets resolve two days later, so the
      // row below still reports all-zero payouts — which would keep the redeem CTA hidden for as
      // long as that lasts. Everything else here (outcomes, tokens, pools) is unaffected by a
      // resolution, so it keeps coming from the table.
      fetchMarketsOnChain([L1_MARKET_ID, OTHER_MARKET_ID]),
    ]);
    if (error) {
      throw error;
    }
    if (!data) {
      throw { message: "Market not found" };
    }
    if (otherMarketError) {
      throw otherMarketError;
    }
    if (!otherMarketData) {
      throw { message: "Other market not found" };
    }
    const wrappedTokens = (data.wrappedTokens as Address[]).concat(
      otherMarketData.wrappedTokens as Address[],
    );
    const outcomesByMarket = (data.outcomes as string[])
      .map((outcome) => ({ outcome, marketId: L1_MARKET_ID }))
      .concat(
        (otherMarketData.outcomes as string[]).map((outcome) => ({
          outcome: outcome === "Invalid result" ? "Other Invalid result" : outcome,
          marketId: otherMarketData.id,
        })),
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
    // return ticks data and current price
    const repoToPriceMapping = outcomesByMarket.reduce(
      (mapping, { outcome, marketId }, index) => {
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
          feeTier,
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
            feeTier,
          },
        };
        return mapping;
      },
      {} as {
        [key: string]: {
          id: Address;
          price: number | null;
          pool: PoolInfo | null;
          marketId: string;
        };
      },
    );
    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        wrappedTokens,
        // On-chain, so this is real the moment the market resolves rather than whenever Seer's
        // indexer catches up.
        payoutNumerators: onChainParent.payoutNumerators,
        // The redeem walks these two levels in turn, and needs each one's tokens in outcome order
        // (`wrappedTokens` above is a flat parent+child concat that `marketsData` is indexed
        // against, so it cannot be split back apart here).
        // `payoutNumerators` and `parentOutcome` ride along per level so the redeem dialog can
        // price what a claim pays out: a parent token settles at its share of the parent payout,
        // and a child token at its share of the *carrier* — the parent's `parentOutcome` token
        // that collateralizes the child.
        parentMarket: {
          id: onChainParent.id,
          wrappedTokens: onChainParent.wrappedTokens,
          marketStatus: onChainParent.marketStatus,
          payoutNumerators: onChainParent.payoutNumerators,
        },
        otherMarket: {
          id: onChainOther.id,
          wrappedTokens: onChainOther.wrappedTokens,
          marketStatus: onChainOther.marketStatus,
          payoutNumerators: onChainOther.payoutNumerators,
          parentOutcome: onChainOther.parentOutcome,
        },
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
