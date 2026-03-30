import { getToken0Token1, isTwoStringsEqual } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L1_MARKET_ID,
  L2_PARENT_MARKET_ID,
  ORIGINALITY_PARENT_MARKET_ID,
} from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";
import { getChartData } from "./utils/getChartData";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

const getL1Pairs = async () => {
  const { data, error } = await supabase
    .from("markets")
    .select("subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators")
    .eq("id", L1_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (error) {
    throw error;
  }
  if (!data) {
    throw { message: "Market not found" };
  }
  const { data: otherMarketData, error: otherMarketError } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->blockTimestamp,subgraph_data->outcomes,subgraph_data->payoutNumerators",
    )
    .eq("subgraph_data->parentMarket->>id", L1_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (otherMarketError) {
    throw otherMarketError;
  }
  if (!otherMarketData) {
    throw { message: "Other market not found" };
  }
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;
  const wrappedTokens = (data.wrappedTokens as Address[]).concat(
    otherMarketData.wrappedTokens as Address[],
  );
  const outcomes = (data.outcomes as string[]).concat(otherMarketData.outcomes as string[]);
  const chartData = await getChartData(
    wrappedTokens.map((x) => getToken0Token1(x, collateral)),
    otherMarketData.blockTimestamp
      ? Number(otherMarketData.blockTimestamp)
      : Math.floor(new Date("2025-09-01").getTime() / 1000),
  );
  const chartWithMarketData = chartData.map((poolHourDatas, outcomeIndex) => {
    return {
      poolHourDatas,
      outcomeName: outcomes[outcomeIndex],
      outcomeId: wrappedTokens[outcomeIndex],
      collateral,
      marketId: L1_MARKET_ID,
    };
  });
  const { error: upsertError } = await supabase.from("key_value").upsert(
    {
      key: `market_chart_hour_data_${L1_MARKET_ID}_${CHAIN_ID}_deep_pm`,
      value: { chartData: chartWithMarketData, timestamp: Date.now(), marketId: L1_MARKET_ID },
    },
    { onConflict: "key" },
  );
  if (upsertError) {
    console.log("insert l1 error", upsertError.message);
  }
};

const getOriginalityPairs = async () => {
  let { data, error } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->blockTimestamp",
    )
    .eq("subgraph_data->parentMarket->>id", ORIGINALITY_PARENT_MARKET_ID)
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
    blockTimestamp: string;
  }[];
  const chartData = (
    await getChartData(
      markets
        .map((market) =>
          market.wrappedTokens.map((x) => getToken0Token1(x, market.collateralToken)),
        )
        .flat(),
      Math.min(
        ...markets.map((market) =>
          market.blockTimestamp
            ? Number(market.blockTimestamp)
            : Math.floor(new Date("2025-09-01").getTime() / 1000),
        ),
      ),
    )
  ).flat();
  for (const market of markets) {
    const chartDataMarket = market.wrappedTokens.map((token) => {
      const poolHourDatas = chartData.filter((data) => {
        return (
          isTwoStringsEqual(
            data.pool.token0.id,
            getToken0Token1(token, market.collateralToken).token0,
          ) &&
          isTwoStringsEqual(
            data.pool.token1.id,
            getToken0Token1(token, market.collateralToken).token1,
          )
        );
      });
      return poolHourDatas;
    });
    const chartWithMarketData = chartDataMarket.map((poolHourDatas, outcomeIndex) => {
      return {
        poolHourDatas,
        outcomeName: market.outcomes[outcomeIndex],
        outcomeId: market.wrappedTokens[outcomeIndex],
        collateral: market.collateralToken,
        marketId: market.id,
      };
    });
    const { error: upsertError } = await supabase.from("key_value").upsert(
      {
        key: `market_chart_hour_data_${market.id}_${CHAIN_ID}_deep_pm`,
        value: { chartData: chartWithMarketData, timestamp: Date.now(), marketId: market.id },
      },
      { onConflict: "key" },
    );
    if (upsertError) {
      console.log("insert originality error", upsertError.message);
    }
  }
};

const getL2Pairs = async () => {
  let { data, error } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome",
    )
    .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
    .ilike("subgraph_data->>marketName", "%What will be the average weight of%")
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
    blockTimestamp: string;
  }[];
  const chartData = (
    await getChartData(
      markets
        .map((market) =>
          market.wrappedTokens.map((x) => getToken0Token1(x, market.collateralToken)),
        )
        .flat(),
      Math.min(
        ...markets.map((market) =>
          market.blockTimestamp
            ? Number(market.blockTimestamp)
            : Math.floor(new Date("2025-09-01").getTime() / 1000),
        ),
      ),
    )
  ).flat();
  for (const market of markets) {
    const chartDataMarket = market.wrappedTokens.map((token) => {
      const poolHourDatas = chartData.filter((data) => {
        return (
          isTwoStringsEqual(
            data.pool.token0.id,
            getToken0Token1(token, market.collateralToken).token0,
          ) &&
          isTwoStringsEqual(
            data.pool.token1.id,
            getToken0Token1(token, market.collateralToken).token1,
          )
        );
      });
      return poolHourDatas;
    });
    const chartWithMarketData = chartDataMarket.map((poolHourDatas, outcomeIndex) => {
      return {
        poolHourDatas,
        outcomeName: market.outcomes[outcomeIndex],
        outcomeId: market.wrappedTokens[outcomeIndex],
        collateral: market.collateralToken,
        marketId: market.id,
      };
    });
    const { error: upsertError } = await supabase.from("key_value").upsert(
      {
        key: `market_chart_hour_data_${market.id}_${CHAIN_ID}_deep_pm`,
        value: { chartData: chartWithMarketData, timestamp: Date.now(), marketId: market.id },
      },
      { onConflict: "key" },
    );
    if (upsertError) {
      console.log("insert l2 error", upsertError.message);
    }
  }
};

export default async () => {
  try {
    console.log("getting l1 chart");
    await getL1Pairs();
  } catch {}
  try {
    console.log("getting originality chart");
    await getOriginalityPairs();
  } catch {}
  try {
    console.log("getting l2 chart");
    await getL2Pairs();
  } catch {}
};
