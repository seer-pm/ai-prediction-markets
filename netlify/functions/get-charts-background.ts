import { ChartWithMarketData, PoolHourData } from "@/types";
import { getToken0Token1 } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  L1_MARKET_ID,
  L2_PARENT_MARKET_ID,
  OCTANT_MARKET_ID,
  ORIGINALITY_PARENT_MARKET_ID,
} from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";
import { buildChartSeries, getMarketChartSeriesKey } from "./utils/buildChartSeries";
import { getChartData, getPoolIds } from "./utils/getChartData";
import type { MarketOnChain } from "./utils/marketView";
import { fetchZcashMarketsOnChain } from "./utils/zcashOnChain";
import { fetchZcashNu7MarketsOnChain } from "./utils/zcashNu7OnChain";
import {
  getPoolVolumes,
  poolPairKey,
  sumMarketTotals,
  type MarketTotals,
  type PoolVolumeData,
} from "./utils/poolVolumes";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * State the writers need but do not receive as arguments.
 *
 * `upsertMarketChart` is reached through five contest writers with five different signatures, and
 * threading two run-scoped numbers through all of them buys nothing over setting them once here. The
 * handler assigns this before any writer runs; nothing else mutates it.
 */
let currentRun = {
  /** Unix seconds the candle walk covered up to — stamped on every blob this run touches. */
  through: 0,
  /** False on a run that walked all of history, which is the only kind that can complete a blob. */
  incremental: false,
};

/** A candle is identified by its pool and the hour it covers; the same pair from two runs is one candle. */
const candleKey = (candle: PoolHourData) => `${candle.pool.id.toLowerCase()}-${candle.periodStartUnix}`;

/**
 * How long a sub-hour price point is worth keeping.
 *
 * `getChartData` returns two kinds of row. Real `poolHourDatas` start on the hour and are the chart's
 * substance. The rest are synthesised from individual swaps and carry the swap's own second-resolution
 * timestamp — they exist to show movement inside an hour that has not closed yet.
 *
 * They never used to accumulate, because a full walk's swap pagination cursors by `id` while ordering
 * by `timestamp` and so returns almost nothing at this size — the full walk measures zero sub-hour
 * rows against 11,368 real ones. An incremental window is small enough that the same query returns
 * them all, which is a genuine improvement to a live chart and a genuine problem for a blob that is
 * now an accumulator: kept forever, they would grow it without bound for detail that
 * `buildChartSeries` resamples away at 30-minute resolution anyway.
 *
 * So they age out while the hourly candles never do. A week keeps every chart's live end dense and
 * leaves its history exactly as complete as it was before.
 */
const SUB_HOUR_RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** Real hourly candles start on the hour; anything else was synthesised from a single swap. */
const isHourly = (candle: PoolHourData) => candle.periodStartUnix % 3600 === 0;

/**
 * Prior candles plus this run's, deduped, aged, and back in time order.
 *
 * The fresh copy wins on a collision: the last hour of a window is usually still open when it is
 * read, so the next run sees the same bucket with more trades in it.
 */
const mergeCandles = (prior: PoolHourData[], fresh: PoolHourData[]) => {
  const floor = currentRun.through > 0 ? currentRun.through - SUB_HOUR_RETENTION_SECONDS : 0;
  const keep = (candle: PoolHourData) => isHourly(candle) || candle.periodStartUnix >= floor;

  const byKey = new Map<string, PoolHourData>();
  for (const candle of prior) if (keep(candle)) byKey.set(candleKey(candle), candle);
  for (const candle of fresh) if (keep(candle)) byKey.set(candleKey(candle), candle);
  return [...byKey.values()].sort((a, b) => a.periodStartUnix - b.periodStartUnix);
};

/**
 * Persists one market's chart in both shapes.
 *
 * `market_chart_hour_data_*` is the raw hourly candles, kept as the source of truth (and for a future
 * client-side period picker). `market_chart_series_*` is what the app actually reads: the same data
 * already resampled into point lists, which is what turned a multi-megabyte download plus a
 * hundred-series client rebuild into a small request the browser can draw straight away.
 *
 * Since the walk went incremental, `chartWithMarketData` carries only the candles newer than the
 * run's cursor, so the raw blob is no longer something to overwrite — it is the accumulator, and this
 * merges into it. There is no correct way to write a partial window without first seeing what it is
 * being added to, so a market with new candles is always read before it is written.
 *
 * A failure on either write is logged, not thrown — one contest losing its chart must not cost the
 * other four theirs.
 */
const upsertMarketChart = async (
  label: string,
  marketId: string,
  chartWithMarketData: ChartWithMarketData,
  totals: MarketTotals,
) => {
  const rawKey = `market_chart_hour_data_${marketId}_${CHAIN_ID}_deep_pm`;
  const seriesKey = getMarketChartSeriesKey(marketId, CHAIN_ID);

  // `matched` is false when none of this market's pools were in the volume index. Writing the zeros
  // that implies would replace a good figure with `"0 "` rather than refresh it.
  //
  // Liquidity is gated on the same flag, but a zero that does get written means something different:
  // it is a real reading — every LP has withdrawn — where a zero volume on a market that has traded
  // could only ever be a failed read.
  const poolFields = totals.matched
    ? {
        // `totalVolumeMarket` keeps its `<amount> <collateral name>` shape — every reader splits it
        // on the space — and the notional count rides alongside as a bare number, since its unit is
        // always "outcome tokens". Liquidity mirrors both, so one parser serves the pair.
        totalVolumeMarket: `${totals.volume.collateral} ${totals.collateralName}`,
        totalVolumeTokens: `${totals.volume.tokens}`,
        totalLiquidityMarket: `${totals.liquidity.collateral} ${totals.collateralName}`,
        totalLiquidityTokens: `${totals.liquidity.tokens}`,
      }
    : undefined;

  const freshCount = chartWithMarketData.reduce((n, { poolHourDatas }) => n + poolHourDatas.length, 0);

  // The series blob is the small one — point lists, not candles — and it is the only one needed to
  // decide whether this market has a chart at all. The raw blob is megabytes, so it is fetched only
  // when there is something to merge into it. On a settled incremental run most markets see no new
  // candles in a quarter of an hour, and for those this is the difference between reading a few
  // kilobytes and reading the entire history of every contest.
  const { data: seriesData, error: seriesError } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", seriesKey)
    .maybeSingle();
  if (seriesError) {
    console.log(`read ${label} error`, seriesError.message);
    return;
  }
  const priorSeries = seriesData?.value as Record<string, unknown> | undefined;

  // Nothing new to fold in and nothing to say about volume: leave the blobs untouched rather than
  // rewrite megabytes of identical candles.
  if (!freshCount && !poolFields && priorSeries) return;
  // No candles and no blob to annotate means there is no chart here at all — before the liquidity
  // script runs a market has no pools, and a row of empty series would only mask that.
  if (!freshCount && !priorSeries) return;

  let priorRaw: Record<string, unknown> | undefined;
  if (freshCount) {
    const { data: rawData, error: rawError } = await supabase
      .from("key_value")
      .select("value")
      .eq("key", rawKey)
      .maybeSingle();
    if (rawError) {
      console.log(`read ${label} raw error`, rawError.message);
      return;
    }
    priorRaw = rawData?.value as Record<string, unknown> | undefined;
  }

  const priorByOutcome = new Map(
    ((priorRaw?.chartData ?? []) as ChartWithMarketData).map((entry) => [
      entry.outcomeId?.toLowerCase(),
      entry.poolHourDatas ?? [],
    ]),
  );
  const merged: ChartWithMarketData = chartWithMarketData.map((entry) => ({
    ...entry,
    poolHourDatas: mergeCandles(priorByOutcome.get(entry.outcomeId?.toLowerCase()) ?? [], entry.poolHourDatas),
  }));

  // An incremental run that finds no blob has only ever seen its window, so this market's history
  // starts wherever the cursor happened to be. Recorded rather than papered over: the cursor read
  // treats it as a demand for a full walk, and the next run rebuilds the whole thing.
  const partialHistory = currentRun.incremental && !priorRaw;
  if (partialHistory) {
    console.log(`${label} ${marketId}: no prior blob on an incremental run, will rebuild next run`);
  }

  const timestamp = Date.now();
  const rows = [];
  if (freshCount) {
    // Stamped only alongside fresh candles, so `timestamp` keeps meaning "when this chart last
    // moved" — a volume-only update must not make a stale chart look current.
    rows.push({
      key: rawKey,
      value: { ...(priorRaw ?? {}), chartData: merged, timestamp, marketId, ...(poolFields ?? {}) },
    });
    rows.push({
      key: seriesKey,
      value: {
        ...(priorSeries ?? {}),
        series: buildChartSeries(merged),
        timestamp,
        marketId,
        // Every blob this run touched covered the same window, whether or not it found anything in
        // it. The cursor is the minimum of these, so a market left behind holds the window open
        // instead of being silently skipped past.
        candlesThrough: currentRun.through,
        partialHistory,
        ...(poolFields ?? {}),
      },
    });
  } else {
    // Volume-only: the window held nothing for this market, which is still news — it is how the
    // cursor learns that this market is caught up.
    //
    // The raw blob is deliberately left alone. Nothing reads its volume, and rewriting megabytes of
    // unchanged candles to restate a number that lives in the series blob is the one cost this whole
    // change exists to avoid.
    rows.push({
      key: seriesKey,
      value: {
        ...(priorSeries ?? {}),
        marketId,
        candlesThrough: currentRun.through,
        // A full run has seen everything there is to see, so nothing it writes can still be partial.
        // Without this a market that stopped producing candles between the run that flagged it and
        // the run that would have repaired it keeps the flag, and the flag forces a full walk every
        // run thereafter.
        ...(currentRun.incremental ? {} : { partialHistory: false }),
        ...(poolFields ?? {}),
      },
    });
  }

  const { error: writeError } = await supabase.from("key_value").upsert(rows, { onConflict: "key" });
  if (writeError) {
    console.log(`insert ${label} error`, writeError.message);
  }
};

const getL1Pairs = async (
  poolIndex: Map<string, PoolHourData[]>,
  volumeIndex: Map<string, PoolVolumeData>,
) => {
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
  const chartDataMarket = wrappedTokens.map((token) => {
    return poolIndex.get(poolPairKey(token, collateral)) ?? [];
  });
  const totals = sumMarketTotals(volumeIndex, wrappedTokens, collateral);
  const chartWithMarketData = chartDataMarket.map((poolHourDatas, outcomeIndex) => {
    return {
      poolHourDatas,
      outcomeName: outcomes[outcomeIndex],
      outcomeId: wrappedTokens[outcomeIndex],
      collateral,
      marketId: L1_MARKET_ID,
    };
  });
  await upsertMarketChart(
    "l1",
    L1_MARKET_ID,
    chartWithMarketData,
    totals,
  );
};

const getOctantPairs = async (
  poolIndex: Map<string, PoolHourData[]>,
  volumeIndex: Map<string, PoolVolumeData>,
) => {
  const { data, error } = await supabase
    .from("markets")
    .select("subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators")
    .eq("id", OCTANT_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (error) {
    throw error;
  }
  if (!data) {
    throw { message: "Market not found" };
  }
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;
  const wrappedTokens = data.wrappedTokens as Address[];
  const outcomes = data.outcomes as string[];
  const chartDataMarket = wrappedTokens.map((token) => {
    return poolIndex.get(poolPairKey(token, collateral)) ?? [];
  });
  const totals = sumMarketTotals(volumeIndex, wrappedTokens, collateral);
  const chartWithMarketData = chartDataMarket.map((poolHourDatas, outcomeIndex) => {
    return {
      poolHourDatas,
      outcomeName: outcomes[outcomeIndex],
      outcomeId: wrappedTokens[outcomeIndex],
      collateral,
      marketId: OCTANT_MARKET_ID,
    };
  });
  await upsertMarketChart(
    "octant",
    OCTANT_MARKET_ID,
    chartWithMarketData,
    totals,
  );
};

/**
 * The two Zcash contests are sets of separate top-level markets, so unlike the single-market
 * contests above this writes one chart blob *per market* and reads the market set from chain rather
 * than Supabase, which has no rows for either.
 *
 * A market with no pool data in the index is never upserted empty — before the liquidity script runs
 * there are no pools at all, and a run of empty blobs would only mask that. That call belongs to
 * `upsertMarketChart`, which knows whether a blob already exists to annotate; skipping the market
 * here instead would also drop the volume update, which needs no candles to be correct.
 *
 * Shared by the 37 binary grants markets and the 5 categorical NU7 markets — the only thing that
 * differs is the market list and the blob label, and neither cares how many outcomes a market has.
 */
const getFlatMarketPairs = async (
  label: string,
  markets: MarketOnChain[],
  poolIndex: Map<string, PoolHourData[]>,
  volumeIndex: Map<string, PoolVolumeData>,
) => {
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;

  for (const market of markets) {
    const { id: marketId, wrappedTokens, outcomes } = market;
    const chartDataMarket = wrappedTokens.map(
      (token) => poolIndex.get(poolPairKey(token, collateral)) ?? [],
    );
    const totals = sumMarketTotals(volumeIndex, wrappedTokens, collateral);
    const chartWithMarketData = chartDataMarket.map((poolHourDatas, outcomeIndex) => ({
      poolHourDatas,
      outcomeName: outcomes[outcomeIndex],
      outcomeId: wrappedTokens[outcomeIndex],
      collateral,
      marketId,
    }));
    await upsertMarketChart(
      label,
      marketId,
      chartWithMarketData,
      totals,
    );
  }
};

const getOriginalityPairs = async (
  poolIndex: Map<string, PoolHourData[]>,
  volumeIndex: Map<string, PoolVolumeData>,
) => {
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
  for (const market of markets) {
    const totals = sumMarketTotals(volumeIndex, market.wrappedTokens, market.collateralToken);
    const chartDataMarket = market.wrappedTokens.map((token) => {
      return poolIndex.get(poolPairKey(token, market.collateralToken)) ?? [];
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
    await upsertMarketChart(
      "originality",
      market.id,
      chartWithMarketData,
      totals,
    );
  }
};

const getL2Pairs = async (
  poolIndex: Map<string, PoolHourData[]>,
  volumeIndex: Map<string, PoolVolumeData>,
) => {
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
  for (const market of markets) {
    const totals = sumMarketTotals(volumeIndex, market.wrappedTokens, market.collateralToken);
    const chartDataMarket = market.wrappedTokens.map((token) => {
      return poolIndex.get(poolPairKey(token, market.collateralToken)) ?? [];
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
    await upsertMarketChart(
      "l2",
      market.id,
      chartWithMarketData,
      totals,
    );
  }
};

function buildPoolIndex(chartData: PoolHourData[]) {
  const map = new Map<string, PoolHourData[]>();

  for (const data of chartData) {
    const token0 = data.pool.token0.id.toLowerCase();
    const token1 = data.pool.token1.id.toLowerCase();

    const key = `${token0}_${token1}`;

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(data);
  }

  return map;
}

/**
 * Re-read on top of the cursor every run.
 *
 * An hour bucket is usually still open when it is read, and the next run has to see it again to pick
 * up the trades that landed after. Six hours is far more overlap than that needs and costs almost
 * nothing — the candles it re-fetches are deduped by `mergeCandles` — but it is the difference
 * between a missed bucket being repaired and being permanent.
 */
const CURSOR_OVERLAP_SECONDS = 6 * 60 * 60;

/** Where the previous run's drained set lives, so a pool gets one run of grace before it is pruned. */
const RUN_STATE_KEY = `deep_pm_chart_state_${CHAIN_ID}`;

/**
 * How far back this run has to walk.
 *
 * Every blob the previous run touched carries `candlesThrough`, the point its window reached. The
 * minimum across them is the furthest-behind market, and walking from there is what stops a market
 * that missed a run from ending up with a hole: the window stays open until it catches up rather
 * than advancing past it.
 *
 * Zero — walk everything — in the cases where no incremental window is sound: the cursor cannot be
 * read, no blob carries one yet (the first run after this shipped), or some blob was written by an
 * incremental run that had nothing to merge into and says so via `partialHistory`.
 */
const readChartCursor = async (): Promise<number> => {
  const { data, error } = await supabase
    .from("key_value")
    .select("value->candlesThrough,value->partialHistory")
    .like("key", `market_chart_series_%_${CHAIN_ID}_deep_pm`);
  if (error) {
    console.log("cursor read failed, walking everything", error.message);
    return 0;
  }

  const rows = data ?? [];
  if (rows.some((row) => row.partialHistory === true)) {
    console.log("a blob has partial history, walking everything");
    return 0;
  }

  const covered = rows
    .map((row) => Number(row.candlesThrough))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!covered.length) {
    console.log("no blob carries a cursor yet, walking everything");
    return 0;
  }

  return Math.max(0, Math.min(...covered) - CURSOR_OVERLAP_SECONDS);
};

/** The drained set the previous run saw. A pool must read as drained twice before it is pruned. */
const readPreviousDrained = async (): Promise<Set<string>> => {
  const { data } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", RUN_STATE_KEY)
    .maybeSingle();
  const ids = (data?.value as { drainedPoolIds?: string[] } | undefined)?.drainedPoolIds ?? [];
  return new Set(ids.map((id) => id.toLowerCase()));
};

const writeRunState = async (drainedPoolIds: string[]) => {
  const { error } = await supabase
    .from("key_value")
    .upsert({ key: RUN_STATE_KEY, value: { drainedPoolIds } }, { onConflict: "key" });
  if (error) console.log("run state write failed", error.message);
};

export default async () => {
  const { data: poolIdsData } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", `deep_pm_pool_ids`)
    .single();
  const poolIds: string[] = poolIdsData?.value?.poolIds;
  if (!poolIds) {
    throw new Error("Pool ids not found");
  }

  // `deep_pm_pool_ids` is maintained outside this repo, so a newly seeded market set is not in it.
  // Rather than wait for that to be updated by hand, resolve the pools of the on-chain-only
  // contests from their token pairs and union them in — otherwise those tabs render "No price
  // history yet" indefinitely even though the pools exist. Deduped because a pool present in more
  // than one list would be fetched twice.
  let allPoolIds = poolIds;
  const onChainCollateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address as Address;

  // Resolved once and reused by the writers below — the market set is the same read either way, and
  // these are 42 `getMarket` calls across two multicalls, not something to pay for twice.
  const onChainContests: { label: string; markets: MarketOnChain[] }[] = [];
  for (const [label, fetchMarkets] of [
    ["zcash", fetchZcashMarketsOnChain],
    ["zcash-nu7", fetchZcashNu7MarketsOnChain],
  ] as const) {
    try {
      const contestMarkets = await fetchMarkets();
      onChainContests.push({ label, markets: contestMarkets });
      const contestPoolIds = await getPoolIds(
        contestMarkets.flatMap(({ wrappedTokens }) =>
          // Invalid is never seeded, and it is always the last outcome.
          wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, onChainCollateral)),
        ),
      );
      allPoolIds = [...new Set([...allPoolIds, ...contestPoolIds.map((id) => id.toLowerCase())])];
      console.log(
        `${label} pools: ${contestPoolIds.length}, total after union: ${allPoolIds.length}`,
      );
    } catch (e) {
      // A failure here must not cost the other contests their charts.
      console.log(`could not resolve ${label} pool ids`, e);
    }
  }

  console.log(allPoolIds.length);

  // Volumes first, and deliberately so. This is one query per 100 pools reading running totals — a
  // couple of seconds — while the candle walk below is the part that can burn a quarter of an hour
  // and be killed mid-flight. Computed after it, the volume figures the tabs actually print were
  // hostage to it finishing. The same sweep reports which of those ids are pools at all and which
  // have been emptied, both of which the walk needs and neither of which costs an extra request.
  const { byPair: volumeIndex, realPoolIds, drainedPoolIds } = await getPoolVolumes(allPoolIds);

  // A pool has to read as drained on two consecutive runs before it is dropped. Liquidity is read at
  // the instant of the sweep, so a pool whose LP withdrew a minute ago already reads as drained while
  // the swaps that emptied it are still inside the window — pruning on first sighting would lose
  // exactly the trades that mattered most. One run of grace costs one more pass over a pool that will
  // never move again.
  const previousDrained = await readPreviousDrained();
  const prunable = new Set(drainedPoolIds.filter((id) => previousDrained.has(id)));
  const walkPoolIds = realPoolIds.filter((id) => !prunable.has(id));
  console.log(
    `pool ids: ${allPoolIds.length} listed, ${realPoolIds.length} real, ` +
      `${drainedPoolIds.length} drained, ${prunable.size} pruned, ${walkPoolIds.length} walked`,
  );

  const since = await readChartCursor();
  currentRun = { through: Math.floor(Date.now() / 1000), incremental: since > 0 };
  console.log(
    since > 0
      ? `incremental walk from ${new Date(since * 1000).toISOString()}`
      : "full walk (no usable cursor)",
  );

  // The walk used to sit outside any `try`. A throw here — or a retry budget exhausted against the
  // subgraph — rejected the whole handler before a single write, so every contest lost its chart at
  // once while the per-contest guards below gave the impression of covering exactly that. An empty
  // index now degrades each writer to a volume-only update instead: `upsertMarketChart` keeps
  // whatever candles it already has rather than replacing them with nothing.
  let poolIndex = new Map<string, PoolHourData[]>();
  try {
    console.time("get chart");
    const { chartData } = await getChartData(walkPoolIds, since);
    console.timeEnd("get chart");
    console.log(`new candles: ${chartData.length}`);
    poolIndex = buildPoolIndex(chartData);
  } catch (e) {
    console.log("chart data fetch failed, writing volumes only", e);
  }
  try {
    console.log("getting l1 chart");
    await getL1Pairs(poolIndex, volumeIndex);
  } catch (e) {
    console.log(e);
  }
  try {
    console.log("getting octant chart");
    await getOctantPairs(poolIndex, volumeIndex);
  } catch (e) {
    console.log(e);
  }
  try {
    console.log("getting originality chart");
    await getOriginalityPairs(poolIndex, volumeIndex);
  } catch (e) {
    console.log(e);
  }
  try {
    console.log("getting l2 chart");
    await getL2Pairs(poolIndex, volumeIndex);
  } catch (e) {
    console.log(e);
  }
  // A contest whose market read failed above is simply absent here, which is the right outcome: it
  // has no pools in the index either, so every one of its blobs would be skipped anyway.
  for (const { label, markets } of onChainContests) {
    try {
      console.log(`getting ${label} chart`);
      await getFlatMarketPairs(label, markets, poolIndex, volumeIndex);
    } catch (e) {
      console.log(e);
    }
  }

  // Last, so a run that died partway through does not also hand the next run a licence to prune
  // pools it never actually got to walk.
  await writeRunState(drainedPoolIds);
};
