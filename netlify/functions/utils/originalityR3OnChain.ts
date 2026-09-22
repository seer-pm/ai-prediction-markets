import { ORIGINALITY_R3_MARKET_IDS, ORIGINALITY_R3_PARENT_MARKET_ID } from "@/utils/originalityR3Markets";
import { fetchMarketsOnChain, type MarketOnChain } from "./marketView";

/**
 * Reading the round-3 Originality set straight off chain.
 *
 * Same reason as `./zcashNu7OnChain`: the set was created on 2026-09-22, after Seer's Optimism
 * indexer stalled, so Supabase has no rows for it and no query would find the children of the
 * parent. See `./marketView` for the MarketView plumbing this shares.
 *
 * Shared by `get-originality-r3-markets-data` and the chart job so the two cannot disagree about
 * what the market set is.
 */

/** The 98 repo markets, in `ORIGINALITY_R3_MARKETS` order. One multicall. */
export async function fetchOriginalityR3MarketsOnChain(): Promise<MarketOnChain[]> {
  return fetchMarketsOnChain(ORIGINALITY_R3_MARKET_IDS);
}

/** The bundled multi-scalar parent. */
export async function fetchOriginalityR3ParentOnChain(): Promise<MarketOnChain> {
  const [parent] = await fetchMarketsOnChain([ORIGINALITY_R3_PARENT_MARKET_ID]);
  return parent;
}
