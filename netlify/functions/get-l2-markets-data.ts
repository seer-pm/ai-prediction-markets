import { GetPoolsQuery } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { CHAIN_ID, L2_PARENT_MARKET_ID } from "@/utils/constants";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { MarketStatus } from "@seer-pm/sdk";
import { createClient } from "@supabase/supabase-js";
import { compareAsc, fromUnixTime } from "date-fns";
import pLimit from "p-limit";
import { Address } from "viem";

interface Market {
  wrappedTokens: Address[];
  collateralToken: Address;
  id: Address;
  outcomes: string[];
  parentOutcome: number;
  payoutReported: boolean;
  conditionId: Address;
  questions: {
    question: { opening_ts: string; finalize_ts: string; is_pending_arbitration: boolean };
  }[];
}

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

const getMarketStatus = (market: Market) => {
  if (
    !(Number(market.questions[0].question.opening_ts) < Math.round(new Date().getTime() / 1000))
  ) {
    return MarketStatus.NOT_OPEN;
  }

  if (market.questions.every((question) => Number(question.question.finalize_ts) === 0)) {
    return MarketStatus.OPEN;
  }

  if (market.questions.some((question) => question.question.is_pending_arbitration)) {
    return MarketStatus.IN_DISPUTE;
  }

  if (
    market.questions.some((question) => {
      const finalizeTs = Number(question.question.finalize_ts);
      const isFinalized =
        !question.question.is_pending_arbitration &&
        finalizeTs > 0 &&
        compareAsc(new Date(), fromUnixTime(finalizeTs)) === 1;
      return finalizeTs === 0 || !isFinalized;
    })
  ) {
    return MarketStatus.ANSWER_NOT_FINAL;
  }

  if (!market!.payoutReported) {
    return MarketStatus.PENDING_EXECUTION;
  }

  return MarketStatus.CLOSED;
};

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

async function getCharts(keys: string[]) {
  try {
    const chunkSize = 4;
    const concurrency = 5;

    function chunkArray(arr: any[], size: number) {
      const res = [];
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

    const allData = results.flat();

    return {
      data: allData,
    };
  } catch (e) {
    return {
      data: null,
      error: e,
    };
  }
}

export default async () => {
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
    // Charts (depends on market ids) and pools (independent) can run concurrently.
    console.time("get chart + pools");
    const [{ data: chartData, error: chartError }, pools] = await Promise.all([
      getCharts(markets.map((market) => `market_chart_hour_data_${market.id}_${CHAIN_ID}_deep_pm`)),
      getPools(),
    ]);
    console.timeEnd("get chart + pools");
    const charts = chartError
      ? null
      : (chartData?.reduce<Record<string, any>>((acc, row) => {
          acc[row.value.marketId] = row.value.chartData;
          return acc;
        }, {}) ?? {});
    const totalVolumeMapping = chartError
      ? null
      : (chartData?.reduce<Record<string, any>>((acc, row) => {
          acc[row.value.marketId] = row.value.totalVolumeMarket;
          return acc;
        }, {}) ?? {});
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
        charts,
        chartError,
        totalVolumeMapping,
      }),
      {
        status: 200,
        headers: {
          ...EDGE_CACHE_HEADERS,
        },
      },
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
