import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { ChartWithMarketData, PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID } from "@/utils/constants";
import { NO_INDEX, YES_INDEX, ZCASH_MARKETS } from "@/utils/zcashMarkets";
import { createClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { Address } from "viem";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { fetchZcashMarketsOnChain } from "./utils/zcashOnChain";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/** Per-market chart blobs, read in small parallel chunks so 37 keys stay inside one round of PostgREST. */
async function getCharts(keys: string[]) {
  try {
    const chunkSize = 4;
    const concurrency = 5;

    function chunkArray<T>(arr: T[], size: number) {
      const res: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        res.push(arr.slice(i, i + size));
      }
      return res;
    }

    const chunks = chunkArray(keys, chunkSize);
    const limit = pLimit(concurrency);

    const results = await Promise.all(
      chunks.map((chunk) =>
        limit(async () => {
          const { data, error } = await supabase.from("key_value").select("value").in("key", chunk);

          if (error) throw error;
          return data || [];
        }),
      ),
    );

    return { data: results.flat() };
  } catch (e) {
    return { data: null, error: e };
  }
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    const markets = await fetchZcashMarketsOnChain();

    // Charts and pool data both depend only on `markets` but not on each other — run concurrently.
    const [{ data: chartData, error: chartError }, queryResult] = await Promise.all([
      getCharts(markets.map((market) => `market_chart_hour_data_${market.id}_${CHAIN_ID}_deep_pm`)),
      UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
        query: GetPoolsDocument,
        variables: {
          first: 1000,
          where: {
            // Invalid is never seeded with liquidity, so only YES and NO are priced.
            or: markets.flatMap(({ wrappedTokens, collateralToken }) =>
              wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)),
            ),
          },
        },
      }),
    ]);

    const charts = chartError
      ? null
      : (chartData?.reduce<Record<string, ChartWithMarketData>>((acc, row) => {
          acc[row.value.marketId] = row.value.chartData;
          return acc;
        }, {}) ?? {});
    const totalVolumeMapping = chartError
      ? null
      : (chartData?.reduce<Record<string, string>>((acc, row) => {
          acc[row.value.marketId] = row.value.totalVolumeMarket;
          return acc;
        }, {}) ?? {});

    // A transport failure, not an empty result: no liquidity has been seeded yet, so `pools: []`
    // is the expected answer today and must fall through to null prices rather than throwing.
    if (!queryResult.data) {
      throw { message: "Pool query failed" };
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
      return { liquidity, tick, token0: poolToken0Id, token1: poolToken1Id, ticks, feeTier, price };
    };

    // Keyed by proposal title, which is what the predictions CSV joins on. The order of
    // `ZCASH_MARKETS` and of `markets` match because the multicall preserves input order.
    const projectToPriceMapping = markets.reduce(
      (mapping, market, index) => {
        const yesPool = getPoolByTokenPair(market.wrappedTokens[YES_INDEX], market.collateralToken);
        const noPool = getPoolByTokenPair(market.wrappedTokens[NO_INDEX], market.collateralToken);
        mapping[ZCASH_MARKETS[index].title] = {
          id: market.id,
          yesPrice: yesPool?.price ?? null,
          yesPool,
          noPrice: noPool?.price ?? null,
          noPool,
        };
        return mapping;
      },
      {} as {
        [key: string]: {
          id: Address;
          yesPrice: number | null;
          noPrice: number | null;
          yesPool: PoolInfo | null;
          noPool: PoolInfo | null;
        };
      },
    );

    return new Response(
      JSON.stringify({
        marketsData: projectToPriceMapping,
        markets,
        charts,
        totalVolumeMapping,
        chartError,
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
