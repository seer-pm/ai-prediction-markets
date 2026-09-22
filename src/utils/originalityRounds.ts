import { Address } from "viem";
import { ORIGINALITY_PARENT_MARKET_ID } from "./constants";
import {
  ORIGINALITY_R3_PARENT_INVALID_TOKEN,
  ORIGINALITY_R3_PARENT_MARKET_ID,
} from "./originalityR3Markets";

/**
 * The Originality tab, hooks and data functions serve two rounds that differ only in these values.
 *
 * Round 2 is ONE multi-categorical parent (98 repos + Invalid): each repo's scalar market is
 * collateralized in that repo's own parent outcome token. Round 3 could not be built that way — OP
 * Mainnet now caps a transaction at 2^24 gas, and a 98-outcome parent needs ~37M — so its parent is a
 * 3-outcome multi-scalar ("Bundle A/B/C"), and ~33 repo markets share each bundle's token as
 * collateral. The bundles are a gas workaround only; the UI lists the 98 repos flat either way.
 *
 * What that sharing changes is confined to a few places, each keyed off the data rather than off
 * the round id: the trade budget (`useExecuteOriginalityStrategy`) and the merge
 * (`useSellToCollateral`) group rows by collateral token, which is a no-op for round 2 where every
 * token is unique.
 */
export interface OriginalityRound {
  id: "round2" | "round3";
  /** Chart eyebrow. */
  eyebrow: string;
  parentMarketId: Address;
  /** The parent's Invalid outcome token — the last leg of a complete-set merge. */
  parentInvalidToken: Address;
  /** Netlify function serving `GetOriginalityMarketsDataApiResult`. */
  dataFunction: string;
  queryKey: readonly string[];
  /** localStorage key for the uploaded predictions — one per round, so a round-2 CSV never trades round 3. */
  predictionsStorageKey: string;
  /** How the volume/liquidity figures name their unit: the repo markets' collateral is not sUSDS. */
  collateralUnit: { symbol: string; note: string };
}

export const ORIGINALITY_ROUND_2: OriginalityRound = {
  id: "round2",
  eyebrow: "Round 2 · Originality",
  parentMarketId: ORIGINALITY_PARENT_MARKET_ID,
  parentInvalidToken: "0x2281bb55063b8d036e5077f5b654c9bb1b397a34",
  dataFunction: "get-originality-markets-data",
  queryKey: ["fetchOriginalityMarketsData"],
  predictionsStorageKey: "originality-default",
  collateralUnit: {
    symbol: "repo tokens",
    note: "Denominated in the repository's parent outcome token, not in sUSDS.",
  },
};

export const ORIGINALITY_ROUND_3: OriginalityRound = {
  id: "round3",
  eyebrow: "Round 3 · Originality",
  parentMarketId: ORIGINALITY_R3_PARENT_MARKET_ID,
  parentInvalidToken: ORIGINALITY_R3_PARENT_INVALID_TOKEN,
  dataFunction: "get-originality-r3-markets-data",
  // Same first element as round 2 so the persister (keyed on `queryKey[0]`) keeps it, and so a
  // prefix refetch of `["fetchOriginalityMarketsData"]` refreshes both rounds.
  queryKey: ["fetchOriginalityMarketsData", "round3"],
  predictionsStorageKey: "originality-r3",
  collateralUnit: {
    symbol: "parent tokens",
    note: "Denominated in the parent market's outcome token, not in sUSDS.",
  },
};
