import { ChartSeries } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { CHAIN_ID } from "@/utils/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** Cash volume, as `<amount> <collateral name>` — the collateral leg of every swap. */
  totalVolumeMarket: string;
  /**
   * Notional volume: the outcome-token leg of the same swaps, summed over the market's outcomes.
   * Empty on a blob written before it was stored, until the next cron run or volume refresh.
   */
  totalVolumeTokens: string;
  /**
   * Collateral sitting in the market's pools *now*, in the same `<amount> <collateral name>` shape.
   *
   * Unlike volume this is a balance, not a running total: it falls when an LP withdraws, and a market
   * whose pools have all been emptied reads a true zero. Empty on a blob written before it was
   * stored.
   */
  totalLiquidityMarket: string;
  /** The outcome-token leg of the same reading: shares sitting in the pools now. */
  totalLiquidityTokens: string;
  series: ChartSeries[];
};

/**
 * The two numbers behind a pool figure, parsed out of the stored strings.
 *
 * `collateral` is the cash leg; `tokens` is the outcome-token leg. They differ by the price the
 * shares traded at, so at a 0.02 price the notional count is fifty times the cash — which is why
 * every tab shows one and puts the other on hover. `tokens` is `undefined` (not zero) when the blob
 * predates the field, so a caller can tell "none" from "not recorded yet".
 */
function parseFigure(cashField: string | undefined, tokensField: string | undefined) {
  const [amount] = (cashField ?? "").split(" ");
  // Not `Number("")`, which is 0: a market with no blob has no figure, and must print none.
  if (!amount) return undefined;
  const collateral = Number(amount);
  if (!Number.isFinite(collateral)) return undefined;
  // Same trap on the other field: an older blob carries `""`, and `Number("")` is 0 — which would
  // report a market as having no shares rather than as not having been counted.
  const tokens = tokensField ? Number(tokensField) : NaN;
  return { collateral, tokens: Number.isFinite(tokens) ? tokens : undefined };
}

/** All-time swap volume: what has been paid and received, and how many shares moved. */
export function chartVolume(chart: MarketChart | undefined) {
  return parseFigure(chart?.totalVolumeMarket, chart?.totalVolumeTokens);
}

/**
 * Current pool depth: the collateral and outcome tokens sitting in the market's pools right now.
 *
 * `undefined` means "not recorded" — a blob the cron has not rewritten since liquidity was stored —
 * which is not the same as a zero, a market whose LPs have all withdrawn.
 */
export function chartLiquidity(chart: MarketChart | undefined) {
  return parseFigure(chart?.totalLiquidityMarket, chart?.totalLiquidityTokens);
}

type MarketChartsResponse = Record<string, MarketChart>;

const EMPTY_CHART: MarketChart = {
  series: [],
  totalVolumeMarket: "",
  totalVolumeTokens: "",
  totalLiquidityMarket: "",
  totalLiquidityTokens: "",
};

/**
 * Charts are kept forever and refreshed underneath.
 *
 * Price history is append-only, and the background job that precomputes it runs on a 15-minute
 * cron — so a restored copy is never *wrong*, only behind. That makes it safe to treat the cache as
 * the thing that paints: a market looked at once never shows an empty panel again, on a tab switch
 * or on a cold reload out of IndexedDB, and the fresh series swaps in when it lands.
 *
 * The consumers read `isLoading` (pending *and* no data), not `isFetching`, so a background refresh
 * never puts the spinner back over a chart that is already drawn.
 */
const CHART_QUERY_OPTIONS = {
  retry: 1,
  gcTime: Infinity,
  /**
   * Zero, against the 5-minute global default. The cached copy is what the user sees either way, so
   * there is nothing to protect by suppressing the request behind it.
   */
  staleTime: 0,
  /**
   * `true` — the default — only refetches a *stale* entry, which is a distinction `staleTime: 0`
   * has already erased; "always" says it outright and keeps the intent from quietly reversing if
   * that staleTime is ever raised again.
   */
  refetchOnMount: "always",
  /** Matches the cron that produces the series; anything faster re-downloads an identical payload. */
  refetchInterval: 15 * 60 * 1000,
  /** ...and only while the tab is actually being looked at. */
  refetchIntervalInBackground: false,
  /**
   * Off, on top of the above. Originality draws 98 markets, which is three chunked requests, and
   * refetching them every time the window regains focus buys nothing the interval doesn't.
   */
  refetchOnWindowFocus: false,
} as const;

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
    ...CHART_QUERY_OPTIONS,
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
    ...CHART_QUERY_OPTIONS,
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

type RefreshedVolume = Pick<
  MarketChart,
  "totalVolumeMarket" | "totalVolumeTokens" | "totalLiquidityMarket" | "totalLiquidityTokens"
>;

/**
 * Recompute the volume figure for these markets right now.
 *
 * The series behind a chart are only ever as current as the 15-minute cron that precomputes them,
 * and that is fine — price history is append-only and the line moves visibly on its own. The volume
 * *number* is what people watch after their own trade lands, so it gets its own endpoint
 * (`refresh-market-volume`) that reads the pools' running totals directly, and this writes the
 * answer — volume, and the liquidity read off the same rows — into every cached entry that carries
 * it — the per-market ones and
 * the batched entry the Zcash and Originality tabs read — leaving `series` alone. No invalidation:
 * refetching the whole chart to move one string would put the tab back through its loading state.
 */
export function useRefreshMarketVolume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (marketIds: string[]) => {
      // Chunked on the same boundary as `fetchMarketCharts`, and for the same reason: Originality
      // asks about 98 markets at once, well past what one query string may carry.
      const ids = [...new Set(marketIds.map((id) => id.toLowerCase()))];
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + CHUNK_SIZE));
      }

      const results = await Promise.all(
        chunks.map((chunk) =>
          fetchAppJson<{ volumes: Record<string, RefreshedVolume> }>("refresh-market-volume", {
            ids: chunk.join(","),
          }),
        ),
      );

      return Object.assign({}, ...results.map(({ volumes }) => volumes)) as Record<
        string,
        RefreshedVolume
      >;
    },
    onSuccess: (volumes) => {
      const applyTo = (chart: MarketChart | undefined, id: string) =>
        chart && volumes[id] !== undefined ? { ...chart, ...volumes[id] } : chart;

      for (const id of Object.keys(volumes)) {
        queryClient.setQueryData<MarketChart>(getMarketChartKey(id), (chart) => applyTo(chart, id));
      }

      queryClient.setQueriesData<MarketChartsResponse>(
        { queryKey: ["marketCharts", CHAIN_ID] },
        (charts) =>
          charts &&
          Object.fromEntries(
            Object.entries(charts).map(([id, chart]) => [id, applyTo(chart, id) ?? chart]),
          ),
      );
    },
  });
}
