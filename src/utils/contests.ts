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
  marketId: string;
  /** The contest has ended: trading is closed, only redeeming remains. */
  finished: boolean;
}

export const DEEP_CONTESTS = [
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
