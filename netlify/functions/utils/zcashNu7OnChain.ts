import { ZCASH_NU7_MARKETS } from "@/utils/zcashNu7Markets";
import { fetchMarketsOnChain, type MarketOnChain } from "./marketView";

/**
 * Reading the Zcash NU7 poll market set straight off chain.
 *
 * Same reason as `./zcashOnChain`: Seer's `markets` table has no rows for these — they were created
 * on 2026-09-03, long after its newest indexed Optimism row — so nothing would find them by query.
 * See `./marketView` for the MarketView plumbing this shares.
 *
 * Shared by `get-zcash-nu7-markets-data` and the chart job so the two cannot disagree about what the
 * market set is.
 */

/** `wrappedTokens` is `[...substantive outcomes, INVALID]`; the count varies per market. */
export type ZcashNu7MarketOnChain = MarketOnChain;

/**
 * One multicall covers all 5.
 *
 * Order matches `ZCASH_NU7_MARKETS`, which callers rely on to pair a result with its ballot label.
 */
export async function fetchZcashNu7MarketsOnChain(): Promise<ZcashNu7MarketOnChain[]> {
  return fetchMarketsOnChain(ZCASH_NU7_MARKETS.map((market) => market.address));
}
