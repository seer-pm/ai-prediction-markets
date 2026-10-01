import { ORIGINALITY_R3_MARKET_IDS, ORIGINALITY_R3_PARENT_MARKET_ID } from "@/utils/originalityR3Markets";
import { CHAIN_ID, CONDITIONAL_TOKENS } from "@/utils/constants";
import {
  ORIGINALITY_R3_V3_MARKET_IDS,
  ORIGINALITY_R3_V3_MIDDLE_MARKETS,
  ORIGINALITY_R3_V3_PARENT_MARKET_ID,
} from "@/utils/originalityR3V3Markets";
import { parseAbi, type Address, type Hex } from "viem";
import { fetchMarketsOnChain, publicClient, type MarketOnChain } from "./marketView";

/**
 * Reading the round-3 Originality sets straight off chain.
 *
 * Same reason as `./zcashNu7OnChain`: the first set was created on 2026-09-22, after Seer's
 * Optimism indexer stalled, so Supabase has no rows for it and no query would find the children of
 * the parent. See `./marketView` for the MarketView plumbing this shares.
 *
 * Shared by the data functions and the chart job so they cannot disagree about what a market set
 * is.
 */

/** The first set's 98 repo markets, in `ORIGINALITY_R3_MARKETS` order. One multicall. */
export async function fetchOriginalityR3MarketsOnChain(): Promise<MarketOnChain[]> {
  return fetchMarketsOnChain(ORIGINALITY_R3_MARKET_IDS);
}

/** The first set's bundled multi-scalar parent. */
export async function fetchOriginalityR3ParentOnChain(): Promise<MarketOnChain> {
  const [parent] = await fetchMarketsOnChain([ORIGINALITY_R3_PARENT_MARKET_ID]);
  return parent;
}

/**
 * The corrected set (`@/utils/originalityR3V3Markets`): the same two reads over its own parent and
 * its 98 repo markets.
 *
 * Its three MIDDLE markets are deliberately never read here. `MarketView.getMarket` reverts for
 * them — it walks the parent's outcome list for as many slots as the child has, and a middle
 * market has 33 or 34 slots under a 3-outcome parent — and one revert fails the whole multicall.
 * Nothing needs them read: their addresses and tokens are static in the market list.
 */
export async function fetchOriginalityR3V3MarketsOnChain(): Promise<MarketOnChain[]> {
  return fetchMarketsOnChain(ORIGINALITY_R3_V3_MARKET_IDS);
}

export async function fetchOriginalityR3V3ParentOnChain(): Promise<MarketOnChain> {
  const [parent] = await fetchMarketsOnChain([ORIGINALITY_R3_V3_PARENT_MARKET_ID]);
  return parent;
}

const MIDDLE_MARKET_ABI = parseAbi([
  "function conditionId() view returns (bytes32)",
  "function payoutDenominator(bytes32) view returns (uint256)",
]);

/** A condition id never changes, so it is read once per warm instance. */
let middleConditionIds: Promise<readonly Hex[]> | undefined;

function fetchMiddleConditionIds(): Promise<readonly Hex[]> {
  if (!middleConditionIds) {
    const value = publicClient.multicall({
      contracts: ORIGINALITY_R3_V3_MIDDLE_MARKETS.map(({ marketId }) => ({
        address: marketId,
        abi: MIDDLE_MARKET_ABI,
        functionName: "conditionId" as const,
      })),
      allowFailure: false,
    });
    value.catch(() => {
      if (middleConditionIds === value) middleConditionIds = undefined;
    });
    middleConditionIds = value;
  }
  return middleConditionIds;
}

export interface MiddleMarketOnChain {
  id: Address;
  wrappedTokens: readonly Address[];
  /** Whether its tokens can be redeemed for the bundle token yet. */
  payoutReported: boolean;
}

/**
 * Whether each of the corrected set's middle markets has settled, in `ORIGINALITY_R3_V3_MIDDLE_MARKETS`
 * order. Read from the ConditionalTokens contract because MarketView cannot be asked (see above):
 * a non-zero payout denominator is exactly what `redeemPositions` requires.
 */
export async function fetchOriginalityR3V3MiddleMarketsOnChain(): Promise<MiddleMarketOnChain[]> {
  const conditionIds = await fetchMiddleConditionIds();
  const denominators = await publicClient.multicall({
    contracts: conditionIds.map((conditionId) => ({
      address: CONDITIONAL_TOKENS[CHAIN_ID] as Address,
      abi: MIDDLE_MARKET_ABI,
      functionName: "payoutDenominator" as const,
      args: [conditionId] as const,
    })),
    allowFailure: false,
  });
  return ORIGINALITY_R3_V3_MIDDLE_MARKETS.map(({ marketId, wrappedTokens }, index) => ({
    id: marketId,
    wrappedTokens,
    payoutReported: denominators[index] > 0n,
  }));
}
