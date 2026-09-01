import { ZCASH_MARKETS } from "@/utils/zcashMarkets";
import { fetchMarketsOnChain, type MarketOnChain } from "./marketView";

/**
 * Reading the Zcash market set straight off chain.
 *
 * Every other contest gets its markets from Seer's `markets` table. The 37 Zcash markets are not in
 * it — its newest Optimism row predates their 2026-08-19 creation — so there is no query that would
 * find them. See `./marketView` for the MarketView plumbing this shares with the L1 redeem.
 *
 * Shared by `get-zcash-markets-data` and the chart job so the two cannot disagree about what the
 * market set is.
 */

/** `wrappedTokens` is `[YES, NO, INVALID]` for every market in this set. */
export type ZcashMarketOnChain = MarketOnChain;

/**
 * One multicall covers all 37.
 *
 * Order matches `ZCASH_MARKETS`, which callers rely on to pair a result with its ballot metadata.
 */
export async function fetchZcashMarketsOnChain(): Promise<ZcashMarketOnChain[]> {
  return fetchMarketsOnChain(ZCASH_MARKETS.map((market) => market.address));
}
