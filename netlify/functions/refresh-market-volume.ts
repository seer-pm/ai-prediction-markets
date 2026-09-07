import { getToken0Token1, isTwoStringsEqual } from "@/utils/common";
import { CHAIN_ID, COLLATERAL_TOKENS, L1_MARKET_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address, isAddress } from "viem";
import { getMarketChartSeriesKey } from "./utils/buildChartSeries";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { getPoolIds } from "./utils/getChartData";
import { fetchMarketsOnChain } from "./utils/marketView";
import { getPoolVolumes, poolPairKey } from "./utils/poolVolumes";

/**
 * Recomputes `totalVolumeMarket` for the given markets, now, on request.
 *
 * The number the tabs render is written by `get-charts-background` on a 15-minute cron, and that
 * cron is the whole of its latency: a trade is invisible until the next run finishes, and the first
 * reader after it can still be handed the previous body by the CDN. Rebuilding the chart series on
 * demand is not an option — the job re-pages every pool-hour candle of every pool — but the *volume*
 * alone is two subgraph queries: the pools of this market's token pairs, and their running
 * `volumeToken0`/`volumeToken1` totals. That takes about a second, which is what lets a refresh
 * button sit next to the figure.
 *
 * It writes the answer back into the same `market_chart_series_*` blob the chart reads, so a refresh
 * is shared rather than private to whoever clicked, and it reads `getPoolVolumes` — the same source
 * the cron now uses — so the next cron run agrees with it instead of reverting it.
 *
 * The raw `market_chart_hour_data_*` blob is deliberately left alone: its key keeps whatever casing
 * its writer happened to use (see `getMarketChartSeriesKey`), so it cannot be addressed reliably,
 * and nothing reads its volume. The cron rewrites both within the quarter hour anyway.
 */

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/** Same cap as `get-market-charts`: the ids ride in the query string. */
const MAX_IDS = 64;

/** What one market's volume is summed over — mirrors the pairing each writer in the cron uses. */
type VolumeTarget = { marketId: string; tokens: Address[]; collateral: Address };

type MarketRow = { id: string; wrappedTokens: Address[]; collateralToken: Address | null };

async function fetchMarketRows(ids: string[]): Promise<MarketRow[]> {
  const { data, error } = await supabase
    .from("markets")
    .select("id,subgraph_data->wrappedTokens,subgraph_data->collateralToken")
    .in("id", ids)
    .eq("chain_id", CHAIN_ID);
  if (error) throw error;
  return (data ?? []) as MarketRow[];
}

/**
 * The L1 blob covers two markets: the parent and its "Other repositories" child, summed under the
 * parent's id (see `getL1Pairs`). Refreshing the parent alone would report a number the next cron
 * run would immediately contradict.
 */
async function l1ChildTokens(): Promise<Address[]> {
  const { data, error } = await supabase
    .from("markets")
    .select("subgraph_data->wrappedTokens")
    .eq("subgraph_data->parentMarket->>id", L1_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (error) throw error;
  return (data?.wrappedTokens ?? []) as Address[];
}

/**
 * Where a market's outcome tokens come from depends on the contest, exactly as it does in the cron:
 * Seer's `markets` table for the four indexed ones, MarketView for the Zcash sets, which have no
 * rows there at all.
 */
async function resolveTargets(ids: string[]): Promise<VolumeTarget[]> {
  const primary = COLLATERAL_TOKENS[CHAIN_ID].primary.address as Address;
  const rows = await fetchMarketRows(ids);
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));

  const missing = ids.filter((id) => !byId.has(id));
  const onChain = missing.length > 0 ? await fetchMarketsOnChain(missing as Address[]) : [];
  const onChainById = new Map(onChain.map((market) => [market.id.toLowerCase(), market]));

  const targets: VolumeTarget[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    const market = onChainById.get(id);
    if (!row && !market) continue;

    const tokens = [...((row?.wrappedTokens ?? market?.wrappedTokens ?? []) as Address[])];
    // The indexed contests carry the collateral the market was actually split against — sUSDS for
    // the top-level ones, the parent's outcome token for an Originality or L2 child. The on-chain
    // sets are all top-level, and the cron pairs those against sUSDS.
    const collateral = (row?.collateralToken ?? primary) as Address;

    if (id === L1_MARKET_ID.toLowerCase()) {
      tokens.push(...(await l1ChildTokens()));
    }
    if (tokens.length > 0) targets.push({ marketId: id, tokens, collateral });
  }
  return targets;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        // The point of this endpoint is that its answer is current; nothing may hold on to it.
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
    });

  try {
    const ids = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);

    if (!ids.length) return jsonResponse({ error: "Missing `ids`" }, 400);
    if (ids.length > MAX_IDS) return jsonResponse({ error: `Too many ids (max ${MAX_IDS})` }, 400);
    const invalid = ids.find((id) => !isAddress(id));
    if (invalid) return jsonResponse({ error: `Invalid market id: ${invalid}` }, 400);

    const targets = await resolveTargets([...new Set(ids)]);
    if (!targets.length) return jsonResponse({ error: "No known markets in `ids`" }, 404);

    const pairs = [
      ...new Map(
        targets.flatMap(({ tokens, collateral }) =>
          tokens.map(
            (token) =>
              [poolPairKey(token, collateral), getToken0Token1(token, collateral)] as const,
          ),
        ),
      ).values(),
    ];

    const poolIds = await getPoolIds(pairs);
    // Every market that can be refreshed here trades; no pools at all means the lookup failed, and
    // writing the zeros that implies would wipe a good figure rather than refresh it.
    if (!poolIds.length) return jsonResponse({ error: "No pools found for these markets" }, 502);
    const volumeIndex = await getPoolVolumes(poolIds);

    const volumes: Record<string, string> = {};
    const updates: { key: string; totalVolumeMarket: string }[] = [];

    for (const { marketId, tokens, collateral } of targets) {
      const matched = tokens.filter((token) => volumeIndex.has(poolPairKey(token, collateral)));
      // Same reasoning as above, per market: one whose pools this request could not see keeps
      // whatever the cron last wrote.
      if (!matched.length) continue;

      const total = matched.reduce((acc, token) => {
        const pool = volumeIndex.get(poolPairKey(token, collateral))!;
        return (
          acc + (isTwoStringsEqual(collateral, pool.token0) ? pool.totalVolume0 : pool.totalVolume1)
        );
      }, 0);
      const first = volumeIndex.get(poolPairKey(tokens[0], collateral));
      const collateralSymbol = first
        ? isTwoStringsEqual(collateral, first.token0)
          ? first.token0Name
          : first.token1Name
        : "";

      // Same `<amount> <symbol>` shape the cron writes; the tabs split it on the space.
      const totalVolumeMarket = `${total} ${collateralSymbol}`;
      volumes[marketId] = totalVolumeMarket;
      updates.push({ key: getMarketChartSeriesKey(marketId, CHAIN_ID), totalVolumeMarket });
    }

    // Read-modify-write: `series` is the cron's to own, and only the volume moves here. A market
    // with no blob yet has no chart to annotate either, so it is answered but not written.
    if (updates.length) {
      const { data, error } = await supabase
        .from("key_value")
        .select("key,value")
        .in(
          "key",
          updates.map(({ key }) => key),
        );
      if (error) throw error;

      const existing = new Map((data ?? []).map((row) => [row.key, row.value]));
      const rows = updates
        .filter(({ key }) => existing.has(key))
        .map(({ key, totalVolumeMarket }) => ({
          key,
          value: { ...(existing.get(key) as object), totalVolumeMarket },
        }));

      if (rows.length) {
        const { error: upsertError } = await supabase
          .from("key_value")
          .upsert(rows, { onConflict: "key" });
        // The caller still gets the fresh number; only the sharing of it failed.
        if (upsertError) console.log("refresh-market-volume upsert error", upsertError.message);
      }
    }

    return jsonResponse({ volumes }, 200);
  } catch (e) {
    console.log(e);
    return jsonResponse({ error: (e as Error)?.message || "Internal server error" }, 500);
  }
};
