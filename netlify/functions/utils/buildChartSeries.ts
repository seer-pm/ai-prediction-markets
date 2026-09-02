import { ChartSeries, ChartWithMarketData, PoolHourData } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { Address, formatUnits } from "viem";

/**
 * Turns the raw hourly pool candles the chart job collects into the exact point lists the browser
 * hands to lightweight-charts.
 *
 * This all used to run in `MarketChart.tsx` on every render: a dense 30-minute timeline across the
 * whole history, a binary search per series per tick, and BigInt Q64.96 math per point whenever the
 * subgraph reported a zero price. Fine for two outcomes; a contest runs forty to a hundred. Doing it
 * once per 15-minute cron instead also shrinks the payload by more than an order of magnitude — a raw
 * `PoolHourData` is ~300 bytes of JSON, a `[t, v]` pair is ~22.
 */

/**
 * Supabase key for a market's precomputed series.
 *
 * Lowercased deliberately. Market ids reach the writers from two places — Supabase rows (lowercase)
 * and `fetchZcashMarketsOnChain` via viem (checksummed) — so a key built from the id verbatim is
 * only findable by a caller that happens to guess the same casing. The Zcash charts silently
 * returned nothing until this was pinned down. The raw `market_chart_hour_data_*` keys keep their
 * historical casing; nothing reads them by key except the backfill, which enumerates.
 */
export const getMarketChartSeriesKey = (marketId: string, chainId: number) =>
  `market_chart_series_${marketId.toLowerCase()}_${chainId}_deep_pm`;

const INTERVAL = 30 * 60;

/**
 * The chart renders prices at `precision: 4`, so digits past the sixth decimal are carried across
 * the wire and then thrown away. Rounding here costs nothing visible and pays twice: shorter numbers
 * in the JSON, and more neighbouring points comparing equal, which lets the flat-run collapsing
 * below discard them. `lastPrice` is left alone — it is one number per series, not thousands.
 */
const PRICE_DECIMALS = 6;
const roundPrice = (price: number) =>
  Math.round(price * 10 ** PRICE_DECIMALS) / 10 ** PRICE_DECIMALS;

function findClosestLessThanOrEqualToTimestamp(sortedTimestamps: number[], targetTimestamp: number) {
  let left = 0;
  let right = sortedTimestamps.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;

    if (sortedTimestamps[mid] <= targetTimestamp) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

function calculateTokenPricesFromSqrtPrice(sqrtPrice: string) {
  const s = BigInt(sqrtPrice);

  const token0Price = (2n ** 192n * 10n ** 18n) / (s * s);
  const token1Price = (s * s * 10n ** 18n) / 2n ** 192n;

  return { token0Price, token1Price };
}

function resolveOutcomePrice(d: PoolHourData, collateral: Address): number | null {
  let token0Price = d.token0Price;
  let token1Price = d.token1Price;

  if (token0Price === "0" && token1Price === "0" && d.sqrtPrice && d.sqrtPrice !== "0") {
    const prices = calculateTokenPricesFromSqrtPrice(d.sqrtPrice);

    token0Price = formatUnits(prices.token0Price, 18);
    token1Price = formatUnits(prices.token1Price, 18);
  }

  const token0IsCollateral = isTwoStringsEqual(d.pool.token0.id, collateral);

  const price = token0IsCollateral ? Number(token0Price) : Number(token1Price);

  if (!isFinite(price) || price <= 0) return null;
  return price;
}

// The window during which a series was actually tradable: from the first hour
// liquidity was present to the last hour it was still present. Falls back to
// the series' full range if no point reports liquidity > 0.
function getLiquidityWindow(series: ChartWithMarketData[number]) {
  const arr = series.poolHourDatas;
  if (!arr.length) return null;

  let start: number | null = null;
  let end: number | null = null;

  arr.forEach((d) => {
    if (Number(d.liquidity) > 0) {
      if (start === null) start = d.periodStartUnix;
      end = d.periodStartUnix;
    }
  });

  if (start === null || end === null) {
    start = arr[0].periodStartUnix;
    end = arr[arr.length - 1].periodStartUnix;
  }

  return { start: start as number, end: end as number };
}

/**
 * The resampling grid for ONE series: from its first candle to the last hour it held liquidity.
 *
 * Deliberately per-series rather than per-chart. In the browser this grid used to span every series
 * drawn together, which quietly made a series' extent depend on its neighbours — and the charts that
 * merge one series per market (Zcash, Originality) drew a much earlier start than the charts that
 * show a single market's outcomes. Precomputing per market cannot reproduce that, and should not
 * try: a series' own candles are the only thing that should decide where its line begins.
 */
function buildTimeline(series: ChartWithMarketData[number]) {
  const arr = series.poolHourDatas;
  const window = getLiquidityWindow(series);
  if (!arr.length || !window) return [];

  const start = Math.floor(arr[0].periodStartUnix / INTERVAL) * INTERVAL;
  const end = Math.ceil(window.end / INTERVAL) * INTERVAL;

  const timeline: number[] = [];
  for (let t = start; t <= end; t += INTERVAL) {
    timeline.push(t);
  }

  return timeline;
}

/**
 * The most recent resolvable price for a series, walking back from the end of
 * its liquidity window. Drives both the legend readout and its sort order.
 */
function getLastPrice(series: ChartWithMarketData[number]): number | null {
  const window = getLiquidityWindow(series);
  const end = window?.end ?? Infinity;

  for (let i = series.poolHourDatas.length - 1; i >= 0; i--) {
    const point = series.poolHourDatas[i];
    if (point.periodStartUnix > end) continue;
    const price = resolveOutcomePrice(point, series.collateral);
    if (price != null) return price;
  }
  return null;
}

export function buildChartSeries(chartWithMarketData: ChartWithMarketData): ChartSeries[] {
  return chartWithMarketData.map((outcomeData) => {
    const timeline = buildTimeline(outcomeData);
    const seriesEnd = getLiquidityWindow(outcomeData)?.end ?? Infinity;

    const timestamps = outcomeData.poolHourDatas.map((d) => d.periodStartUnix);
    const points: [number, number][] = [];

    let lastPrice: number | null = null;
    // A flat stretch only needs its two endpoints — the renderer draws a
    // straight line between them. Carrying a point per 30-minute tick for
    // every one of a hundred series is what made panning crawl.
    let pendingFlat: [number, number] | null = null;

    timeline.forEach((t) => {
      if (t > seriesEnd) return; // stop past this series' liquidity removal

      const idx = findClosestLessThanOrEqualToTimestamp(timestamps, t);

      if (idx !== -1) {
        const price = resolveOutcomePrice(outcomeData.poolHourDatas[idx], outcomeData.collateral);

        if (price != null) {
          lastPrice = roundPrice(price); //update latest known price
        }
      }

      if (lastPrice == null) return;

      const previous = points[points.length - 1];
      if (previous && previous[1] === lastPrice) {
        // Same value as the point before: hold it back, and only commit it
        // when the run ends so the flat segment keeps its true length.
        pendingFlat = [t, lastPrice];
        return;
      }

      if (pendingFlat) {
        points.push(pendingFlat);
        pendingFlat = null;
      }
      points.push([t, lastPrice]);
    });

    if (pendingFlat) points.push(pendingFlat);

    return {
      marketId: outcomeData.marketId,
      outcomeName: outcomeData.outcomeName,
      outcomeId: outcomeData.outcomeId,
      points,
      lastPrice: getLastPrice(outcomeData),
    };
  });
}
