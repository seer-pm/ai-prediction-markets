import { ChartSeries } from "@/types";
import { ORIGINALITY_R3_V3_MARKET_IDS } from "@/utils/originalityR3V3Markets";

/**
 * Where a market's chart begins, for markets whose stored history starts earlier than the chart
 * should.
 *
 * The corrected Round 3 pools were seeded at one set of prices and then re-seeded at another, so
 * their candles open with a flat stretch at prices nobody traded at, followed by a jump. Deleting
 * the stored rows would not remove it: the chart job rebuilds a market with no blob from the pools'
 * full history, and the pools are the same pools. So the history is kept as it is and cut here, on
 * the way out — which also makes the cut one constant to move, or to remove.
 *
 * Unix seconds, on the 30-minute grid the series are drawn on. `undefined` cuts nothing.
 *
 * 2026-10-01 13:00 UTC: the start of the hour the re-seed finished in (its last transaction landed
 * at 13:11:45). Not the hour after: an hourly candle carries its hour's CLOSING price, and a pool's
 * last swap in that hour was its re-seed, so the 13:00 candle already reads the re-seeded price.
 * Pools re-seeded in earlier hours have no later candle at all, and carry theirs in.
 */
export const ORIGINALITY_R3_V3_CHART_START: number | undefined = 1790859600;

const CHART_START_BY_MARKET = new Map<string, number>(
  ORIGINALITY_R3_V3_CHART_START === undefined
    ? []
    : ORIGINALITY_R3_V3_MARKET_IDS.map((id) => [id.toLowerCase(), ORIGINALITY_R3_V3_CHART_START]),
);

export function getChartStart(marketId: string): number | undefined {
  return CHART_START_BY_MARKET.get(marketId.toLowerCase());
}

/**
 * A series with everything before `start` removed.
 *
 * The line still has to begin *at* `start`, not at whenever the next trade happened to land, so the
 * price in effect at the cut — the last point at or before it — is carried in as the first point.
 * A series whose points all lie after the cut is returned as it is; one with no points stays empty.
 */
export function trimSeriesToStart(series: ChartSeries, start: number | undefined): ChartSeries {
  if (start === undefined) return series;

  const firstKept = series.points.findIndex(([time]) => time >= start);
  // Every point is before the cut: the price has not moved since, so the line is that price from
  // the cut onwards. The client carries a funded market's last point forward to now.
  const kept = firstKept === -1 ? [] : series.points.slice(firstKept);
  const before = firstKept === -1 ? series.points[series.points.length - 1] : series.points[firstKept - 1];

  if (!before || kept[0]?.[0] === start) return { ...series, points: kept };
  return { ...series, points: [[start, before[1]], ...kept] };
}
