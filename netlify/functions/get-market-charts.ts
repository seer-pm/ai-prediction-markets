import { ChartSeries } from "@/types";
import { CHAIN_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { isAddress } from "viem";
import { getMarketChartSeriesKey } from "./utils/buildChartSeries";
import { CHART_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";

/**
 * Chart history, on its own endpoint.
 *
 * It used to ride inside each contest's market-data payload, which meant the table could not paint
 * until every outcome's full price history had downloaded — 86MB on the L2 tab, of which the UI shows
 * one repository at a time. Split out, each tab asks for exactly the markets it draws, and the reply
 * is the precomputed series the background job already resampled.
 *
 * Batching matters: Zcash and Originality merge one series per market into a single chart, so they
 * would otherwise issue 37 requests to draw 37 lines.
 */

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

const MAX_IDS = 64;

type ChartRow = { series: ChartSeries[]; marketId: string; totalVolumeMarket: string };

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const ids = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!ids.length) {
      return jsonError("Missing `ids`", 400);
    }
    if (ids.length > MAX_IDS) {
      return jsonError(`Too many ids (max ${MAX_IDS})`, 400);
    }
    // These ids are interpolated straight into a PostgREST `in` filter, so validate the shape here
    // rather than trusting the caller.
    const invalid = ids.filter((id) => !isAddress(id));
    if (invalid.length) {
      return jsonError(`Invalid market id: ${invalid[0]}`, 400);
    }

    const keys = ids.map((id) => getMarketChartSeriesKey(id, CHAIN_ID));

    const { data, error } = await supabase
      .from("key_value")
      .select("value")
      .in("key", keys);
    if (error) {
      throw error;
    }

    // Lowercase throughout, matching `getMarketChartSeriesKey`: the stored `marketId` is
    // checksummed for the on-chain-sourced contests and lowercase for the rest, so it is not
    // something a caller can be expected to reproduce.
    const charts = (data ?? []).reduce<
      Record<string, { series: ChartSeries[]; totalVolumeMarket: string }>
    >((acc, row) => {
      const value = row.value as ChartRow;
      acc[value.marketId.toLowerCase()] = {
        series: value.series ?? [],
        totalVolumeMarket: value.totalVolumeMarket ?? "",
      };
      return acc;
    }, {});

    return new Response(JSON.stringify(charts), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CHART_CACHE_HEADERS,
        ...corsHeaders,
      },
    });
  } catch (e) {
    console.log(e);
    return jsonError((e as Error)?.message || "Internal server error", 500);
  }
};
