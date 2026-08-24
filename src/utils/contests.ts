// Relative, not `@/utils/constants`, and it has to stay that way. Netlify's esbuild bundler
// applies the `@/*` path mapping from `netlify/tsconfig.json` only to files under
// `netlify/functions/`. A `src/` file it pulls in transitively keeps its own aliases unresolved:
// they survive into the bundle as bare `@/utils/...` specifiers and the function dies at runtime
// with "Cannot find package '@/utils'". No other `src/` file reached from a function imports a
// *runtime* value this way (`@/types` in `common.ts` is type-only, so it is erased), which is why
// this only surfaced here.
import {
  AI_PREDICTION_MARKET_ID,
  L1_MARKET_ID,
  L2_PARENT_MARKET_ID,
  OCTANT_MARKET_ID,
  ORIGINALITY_PARENT_MARKET_ID,
  ZCASH_MARKET_IDS,
} from "./constants";

/**
 * The deep markets, in one place.
 *
 * The id, the label and the finished flag used to live in `TABS` (Tab.tsx) while the market
 * id lived in `constants.ts`, so adding a contest meant editing both — and the netlify
 * leaderboard function needs the same list a third time. Everything that enumerates contests
 * reads this array; registering a new deep market is one entry here.
 *
 * The ids double as Seer's leaderboard sub-ids: `id` is what
 * `netlify/functions/utils/seerLeaderboard.ts` prefixes with `deepfund:`, and it matches
 * `SEER_APPS.deepfund.markets` upstream. A new contest has to be registered there too before its
 * board exists.
 *
 * `marketId` is the PARENT market. Trading happens on its children, so anything touching
 * on-chain activity has to expand parent → children first.
 */
export interface Contest {
  id: string;
  label: string;
  /**
   * The PARENT market. Absent for a contest that has none — Zcash is 37 independent top-level
   * markets, so it carries `marketIds` instead.
   */
  marketId?: string;
  /** Every market in the contest, for contests with no single parent to expand. */
  marketIds?: readonly string[];
  /** The contest has ended: trading is closed, only redeeming remains. */
  finished: boolean;
  /**
   * Whether Seer materializes a leaderboard for this contest. Defaults to true; set false while
   * the contest is missing from `SEER_APPS.deepfund.markets` upstream, so the scope button is not
   * offered for a board that would come back empty.
   */
  leaderboard?: boolean;
  /**
   * Temporarily hide the contest from the tab bar without unregistering it. Everything else —
   * market ids, the component wiring in `Tab.tsx`, the netlify functions — stays intact, so
   * bringing the contest back is deleting the flag.
   */
  hidden?: boolean;
}

export const DEEP_CONTESTS = [
  {
    id: "zcash",
    label: "Zcash",
    marketIds: ZCASH_MARKET_IDS,
    finished: false,
    leaderboard: false,
    // Hidden pending a business update; remove this line to bring the tab back.
    hidden: true,
  },
  { id: "octant", label: "Octant", marketId: OCTANT_MARKET_ID, finished: true },
  { id: "round2-l2", label: "Round 2 · L2", marketId: L2_PARENT_MARKET_ID, finished: true },
  { id: "round2-l1", label: "Round 2 · L1", marketId: L1_MARKET_ID, finished: false },
  {
    id: "round2",
    label: "Round 2 · Originality",
    marketId: ORIGINALITY_PARENT_MARKET_ID,
    finished: true,
  },
  { id: "round1", label: "Round 1", marketId: AI_PREDICTION_MARKET_ID, finished: true },
] as const satisfies readonly Contest[];

export type ContestId = (typeof DEEP_CONTESTS)[number]["id"];

export function getContest(id: string): Contest | undefined {
  return DEEP_CONTESTS.find((contest) => contest.id === id);
}

export function isContestId(id: string): id is ContestId {
  return DEEP_CONTESTS.some((contest) => contest.id === id);
}

/** Contests Seer has a board for — the only ones worth offering as a leaderboard scope. */
export const LEADERBOARD_CONTESTS = DEEP_CONTESTS.filter(
  (contest) => (contest as Contest).leaderboard !== false,
);
