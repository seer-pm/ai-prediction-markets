/**
 * Rebuilds every `market_chart_series_*` blob from the raw `market_chart_hour_data_*` blobs already
 * in Supabase, and reports how much smaller the result is.
 *
 * The 15-minute chart cron writes both shapes, so this is not needed in steady state. It exists for
 * the two moments that matter: backfilling the series keys immediately after deploying the split
 * (rather than waiting a cron cycle with every chart blank), and checking that
 * `buildChartSeries` produces what the charts expect without a deploy in between.
 *
 *   npm run rebuild:chart-series [-- --dry]
 */
import {
  buildChartSeries,
  getMarketChartSeriesKey,
} from "../netlify/functions/utils/buildChartSeries";
import { ChartWithMarketData } from "@/types";
import { CHAIN_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";

const RAW_PREFIX = "market_chart_hour_data_";
const SUFFIX = `_${CHAIN_ID}_deep_pm`;

const dryRun = process.argv.includes("--dry");

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`;

async function main() {
  // Keys first, values one at a time: the raw blobs are megabytes each, and asking for all of them
  // in one statement is how you get `canceling statement due to statement timeout`.
  const { data: keys, error } = await supabase
    .from("key_value")
    .select("key")
    .like("key", `${RAW_PREFIX}%${SUFFIX}`);
  if (error) throw error;
  if (!keys?.length) throw new Error("No raw chart blobs found");

  let rawTotal = 0;
  let seriesTotal = 0;

  for (const { key } of keys) {
    const { data: row, error: readError } = await supabase
      .from("key_value")
      .select("value")
      .eq("key", key)
      .single();
    if (readError || !row) {
      console.log(`skip ${key}: ${readError?.message ?? "no row"}`);
      continue;
    }

    const marketId: string = row.value.marketId;
    const chartData = row.value.chartData as ChartWithMarketData;
    if (!marketId || !Array.isArray(chartData)) {
      console.log(`skip ${key}: unexpected shape`);
      continue;
    }

    const series = buildChartSeries(chartData);
    const rawSize = JSON.stringify(chartData).length;
    const seriesSize = JSON.stringify(series).length;
    rawTotal += rawSize;
    seriesTotal += seriesSize;

    const points = series.reduce((acc, s) => acc + s.points.length, 0);
    console.log(
      `${marketId}  ${series.length} series, ${points} points  ${kb(rawSize)} -> ${kb(seriesSize)}` +
        `  (${(rawSize / Math.max(seriesSize, 1)).toFixed(1)}x)`,
    );

    if (dryRun) continue;

    const { error: upsertError } = await supabase.from("key_value").upsert(
      {
        key: getMarketChartSeriesKey(marketId, CHAIN_ID),
        value: {
          series,
          timestamp: row.value.timestamp ?? Date.now(),
          marketId,
          totalVolumeMarket: row.value.totalVolumeMarket ?? "",
        },
      },
      { onConflict: "key" },
    );
    if (upsertError) console.log(`  upsert failed: ${upsertError.message}`);
  }

  console.log(
    `\n${keys.length} markets: ${kb(rawTotal)} -> ${kb(seriesTotal)} ` +
      `(${(rawTotal / Math.max(seriesTotal, 1)).toFixed(1)}x smaller)${dryRun ? " [dry run]" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
