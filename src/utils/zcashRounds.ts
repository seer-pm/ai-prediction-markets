import { ZCASH_FORUM_URL, ZCASH_MARKETS, type ZcashMarket } from "./zcashMarkets";
import { ZCASH_Q4_FORUM_URL, ZCASH_Q4_MARKETS } from "./zcashQ4Markets";

/**
 * The Zcash grants rounds that share one view: independent Yes/No markets, one per proposal on the
 * Coinholder-Directed Retroactive Grants ballot, collateralised in sUSDS on Optimism.
 *
 * Everything that differs between rounds lives here — the ballot, the review thread, the copy and
 * the keys things are stored under — so the tab, the CSV parser, the data hook and the Netlify
 * function take a round id instead of each carrying a copy of the Q3 code.
 *
 * Relative imports only: reached from `netlify/functions/get-zcash-markets-data.ts` and the
 * submission fetchers, and Netlify resolves `@/` only under `netlify/functions/`.
 */
export const ZCASH_ROUND_IDS = ["zcash", "zcash-q4"] as const;
export type ZcashRoundId = (typeof ZCASH_ROUND_IDS)[number];

export interface ZcashRound {
  /** The contest id in `DEEP_CONTESTS`, which is also the submission contest. */
  id: ZcashRoundId;
  markets: readonly ZcashMarket[];
  /** "Q3 2026": the poll the market names refer to. */
  poll: string;
  forumUrl: string;
  /** Where this round's uploaded predictions are kept in localStorage. */
  storageKey: string;
  /** Download names for the sample CSV and the "market view" export. */
  sampleFilename: string;
  exportFilename: string;
  /**
   * Every row of the sample CSV carries this one number: a base rate, not an opinion on any
   * proposal. Q3 shipped Seer's published 0.55; Q4 ships Q3's actual approval rate, 17 of 37.
   */
  sampleProbability: number;
}

export const ZCASH_ROUNDS: Record<ZcashRoundId, ZcashRound> = {
  zcash: {
    id: "zcash",
    markets: ZCASH_MARKETS,
    poll: "Q3 2026",
    forumUrl: ZCASH_FORUM_URL,
    storageKey: "zcash-probability",
    sampleFilename: "zcash-predictions",
    exportFilename: "zcash-market-view",
    sampleProbability: 0.55,
  },
  "zcash-q4": {
    id: "zcash-q4",
    markets: ZCASH_Q4_MARKETS,
    poll: "Q4 2026",
    forumUrl: ZCASH_Q4_FORUM_URL,
    storageKey: "zcash-q4-probability",
    sampleFilename: "zcash-q4-predictions",
    exportFilename: "zcash-q4-market-view",
    sampleProbability: 0.46,
  },
};

export function isZcashRoundId(id: string | null | undefined): id is ZcashRoundId {
  return !!id && (ZCASH_ROUND_IDS as readonly string[]).includes(id);
}

const titleIndex = new Map<ZcashRoundId, Map<string, ZcashMarket>>(
  ZCASH_ROUND_IDS.map((id) => [
    id,
    new Map(ZCASH_ROUNDS[id].markets.map((market) => [market.title.toLowerCase(), market])),
  ]),
);

/** Case-insensitive lookup used to validate predictions CSV rows against a round's ballot. */
export function getZcashRoundMarketByTitle(
  roundId: ZcashRoundId,
  title: string,
): ZcashMarket | undefined {
  return titleIndex.get(roundId)?.get(title.trim().toLowerCase());
}

/** The sample CSV: every proposal, in ballot order, at the round's base rate. */
export function sampleZcashRoundPredictions(roundId: ZcashRoundId) {
  const round = ZCASH_ROUNDS[roundId];
  return round.markets.map((market) => ({
    project: market.title,
    probability: round.sampleProbability,
  }));
}
