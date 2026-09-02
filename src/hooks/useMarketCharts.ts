import { ChartSeries } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { CHAIN_ID } from "@/utils/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Chart history, fetched apart from the contest's market data.
 *
 * The two used to arrive together, which meant a tab's table could not paint until every outcome's
 * price history had downloaded with it — and because that payload was far too big to persist, the
 * market-data hooks had to refetch on every single mount. Split apart, the table restores from cache
 * instantly and the chart is a separate, small, independently cacheable request.
 */

export type MarketChart = {
  series: ChartSeries[];
  totalVolumeMarket: string;
};

type MarketChartsResponse = Record<string, MarketChart>;

const EMPTY_CHART: MarketChart = { series: [], totalVolumeMarket: "" };

/**
 * Ids per request. The endpoint caps a batch, and the ids ride in the query string, so a contest
 * with a hundred child markets (Originality has 98) would otherwise overflow both the cap and any
 * sane URL length. Chunks are independent, so they go out together and each stays CDN-cacheable.
 */
const CHUNK_SIZE = 40;

export const getMarketChartKey = (marketId: string) =>
  ["marketChart", CHAIN_ID, marketId.toLowerCase()] as const;

async function fetchMarketCharts(marketIds: string[]): Promise<MarketChartsResponse> {
  const chunks: string[][] = [];
  for (let i = 0; i < marketIds.length; i += CHUNK_SIZE) {
    chunks.push(marketIds.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchAppJson<MarketChartsResponse>("get-market-charts", { ids: chunk.join(",") }),
    ),
  );

  return Object.assign({}, ...results);
}

/** One market's chart: the L1 and Octant tabs, and whichever repository L2 has selected. */
export function useMarketChart(marketId: string | undefined) {
  return useQuery({
    retry: 1,
    enabled: !!marketId,
    queryKey: getMarketChartKey(marketId ?? ""),
    queryFn: async () => {
      const id = marketId!.toLowerCase();
      return (await fetchMarketCharts([id]))[id] ?? EMPTY_CHART;
    },
  });
}

/**
 * Several markets' charts in a single request, fanned out into the same per-market cache entries
 * `useMarketChart` reads — so a tab that later shows one of them on its own gets it for free.
 *
 * Zcash and Originality both draw one series per market on a single chart, so they need every market
 * at once; issuing a request each would trade one big response for 37 small ones.
 */
export function useMarketCharts(marketIds: string[] | undefined) {
  const queryClient = useQueryClient();

  // Sorted so the key is stable however the caller happened to order its markets.
  const ids = useMemo(
    () => [...new Set((marketIds ?? []).map((id) => id.toLowerCase()))].sort(),
    [marketIds],
  );

  return useQuery({
    retry: 1,
    enabled: ids.length > 0,
    queryKey: ["marketCharts", CHAIN_ID, ids.join(",")],
    queryFn: async () => {
      const charts = await fetchMarketCharts(ids);

      for (const id of ids) {
        queryClient.setQueryData(getMarketChartKey(id), charts[id] ?? EMPTY_CHART);
      }

      return charts;
    },
  });
}
