import { Address } from "viem";
import { ORIGINALITY_PARENT_MARKET_ID } from "./constants";
import {
  ORIGINALITY_R3_PARENT_INVALID_TOKEN,
  ORIGINALITY_R3_PARENT_MARKET_ID,
} from "./originalityR3Markets";
import {
  ORIGINALITY_R3_V3_MARKETS,
  ORIGINALITY_R3_V3_MIDDLE_MARKETS,
  ORIGINALITY_R3_V3_PARENT_INVALID_TOKEN,
  ORIGINALITY_R3_V3_PARENT_MARKET_ID,
} from "./originalityR3V3Markets";

/**
 * A level between the parent and the repo markets: a market conditional on one parent outcome
 * token whose own outcomes are the repos. Minting has to pass through it on the way down, and a
 * sell-all has to merge it on the way back up.
 */
export interface OriginalityMiddleMarket {
  marketId: Address;
  /** The parent outcome token this market is split from and merges back into. */
  collateralToken: Address;
  /** Every outcome token, Invalid last — a complete set for the merge. */
  wrappedTokens: readonly Address[];
}

/**
 * The Originality tab, hooks and data functions serve every round; they differ only in these values.
 *
 * Round 2 is ONE multi-categorical parent (98 repos + Invalid): each repo's scalar market is
 * collateralized in that repo's own parent outcome token. Round 3 could not be built that way — OP
 * Mainnet now caps a transaction at 2^24 gas, and a 98-outcome parent needs ~37M — so its parent is
 * a 3-outcome multi-scalar ("Bundle A/B/C") with one multi-categorical market per bundle beneath it
 * (`middleMarkets`), whose outcomes are that bundle's repos. Each repo market is again
 * collateralized in its own repo token, as in round 2; the bundles are a gas workaround only and
 * the UI lists the 98 repos flat either way.
 *
 * The first round-3 set (`ORIGINALITY_ROUND_3_INCORRECT`) was created without that middle level:
 * its repo markets hang directly off the bundle tokens, ~33 to a token. It is kept, withdraw-only
 * and on a page of its own, so the people who traded it can sell back and merge out. That sharing is why the trade budget
 * (`useExecuteOriginalityStrategy`) and the merge (`useSellToCollateral`) group rows by collateral
 * token — a no-op wherever every token is unique.
 */
export interface OriginalityRound {
  id: "round2" | "round3" | "round3-incorrect";
  /** Chart eyebrow. */
  eyebrow: string;
  parentMarketId: Address;
  /** The parent's Invalid outcome token — the last leg of a complete-set merge. */
  parentInvalidToken: Address;
  /** Present when repo markets sit two levels below the parent. */
  middleMarkets?: readonly OriginalityMiddleMarket[];
  /**
   * What one unit of a repo market's collateral token is worth in sUSDS, when it cannot be read
   * off the parent (one sUSDS spread over the parent's outcomes). With a middle level the
   * collateral is a repo token, two splits away from sUSDS.
   */
  collateralUnitPrice?: number;
  /** Netlify function serving `GetOriginalityMarketsDataApiResult`. */
  dataFunction: string;
  queryKey: readonly string[];
  /** localStorage key for the uploaded predictions — one per round, so a round-2 CSV never trades round 3. */
  predictionsStorageKey: string;
  /**
   * The set was built wrongly and replaced. No new trades; selling back to sUSDS and withdrawing
   * stay available. `replacedBy` is the contest tab holding the corrected set.
   */
  incorrect?: { replacedBy: string };
}

export const ORIGINALITY_ROUND_2: OriginalityRound = {
  id: "round2",
  eyebrow: "Round 2 · Originality",
  parentMarketId: ORIGINALITY_PARENT_MARKET_ID,
  parentInvalidToken: "0x2281bb55063b8d036e5077f5b654c9bb1b397a34",
  dataFunction: "get-originality-markets-data",
  queryKey: ["fetchOriginalityMarketsData"],
  predictionsStorageKey: "originality-default",
};

export const ORIGINALITY_ROUND_3: OriginalityRound = {
  id: "round3",
  eyebrow: "Round 3 · Originality",
  parentMarketId: ORIGINALITY_R3_V3_PARENT_MARKET_ID,
  parentInvalidToken: ORIGINALITY_R3_V3_PARENT_INVALID_TOKEN,
  middleMarkets: ORIGINALITY_R3_V3_MIDDLE_MARKETS,
  // sUSDS -> 3 bundle tokens -> that bundle's repo tokens: each repo token is an even share of an
  // even share, which over the whole set is one sUSDS across the repos.
  collateralUnitPrice: 1 / ORIGINALITY_R3_V3_MARKETS.length,
  dataFunction: "get-originality-r3-v3-markets-data",
  // Same first element as round 2 so the persister (keyed on `queryKey[0]`) keeps it, and so a
  // prefix refetch of `["fetchOriginalityMarketsData"]` refreshes every round.
  queryKey: ["fetchOriginalityMarketsData", "round3-v3"],
  // Shared with the incorrect set on purpose: same repos, same question, so a CSV already loaded
  // there carries over.
  predictionsStorageKey: "originality-r3",
};

/** The first round-3 set, missing its middle level. Withdraw-only — see the interface comment. */
export const ORIGINALITY_ROUND_3_INCORRECT: OriginalityRound = {
  id: "round3-incorrect",
  eyebrow: "Round 3 · Originality · incorrect market",
  parentMarketId: ORIGINALITY_R3_PARENT_MARKET_ID,
  parentInvalidToken: ORIGINALITY_R3_PARENT_INVALID_TOKEN,
  dataFunction: "get-originality-r3-markets-data",
  queryKey: ["fetchOriginalityMarketsData", "round3"],
  predictionsStorageKey: "originality-r3",
  incorrect: { replacedBy: "round3" },
};
