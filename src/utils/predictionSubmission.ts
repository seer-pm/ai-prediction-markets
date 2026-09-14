import { sha256, stringToBytes } from "viem";

/**
 * Leaderboard prediction submissions — the numbers a participant commits to when they run a
 * strategy with "Leaderboard submit" on, scored once the markets resolve.
 *
 * Relative imports only in this file, and it has to stay that way: it is reached from
 * `netlify/functions/submit-predictions.ts`, and Netlify's esbuild resolves `@/*` only for files
 * under `netlify/functions/`. See the header of `./profile.ts` for the failure it causes.
 *
 * Shared by the browser and the write endpoint so the two cannot disagree about what was signed.
 */

/**
 * Contests that accept submissions. Only the live ones: a submission on a contest whose markets have
 * already been answered could only ever be scored against a known result.
 */
export const SUBMISSION_CONTESTS = ["zcash-nu7", "zcash"] as const;
export type SubmissionContestId = (typeof SUBMISSION_CONTESTS)[number];

export function isSubmissionContest(id: string): id is SubmissionContestId {
  return (SUBMISSION_CONTESTS as readonly string[]).includes(id);
}

/** One outcome's predicted probability. `outcomeIndex` is the on-chain index, never a CSV number. */
export interface PredictionLeg {
  marketId: string;
  outcomeIndex: number;
  /** In [0, 1]. */
  prediction: number;
}

/** 37 grants markets × 1 leg, or 5 ballot questions × ≤3 legs — generous headroom over both. */
export const MAX_SUBMISSION_LEGS = 200;

/**
 * Lowercased, rounded to 4 dp and sorted, so the same predictions always hash the same. The client
 * applies this before signing; the server hashes what it receives without re-normalising, so a
 * client that skips it gets a signature mismatch rather than a silently different stored value.
 */
export function canonicalLegs(legs: PredictionLeg[]): PredictionLeg[] {
  return legs
    .map((leg) => ({
      marketId: leg.marketId.toLowerCase(),
      outcomeIndex: leg.outcomeIndex,
      prediction: Math.round(leg.prediction * 10_000) / 10_000,
    }))
    .sort((a, b) =>
      a.marketId === b.marketId ? a.outcomeIndex - b.outcomeIndex : a.marketId < b.marketId ? -1 : 1,
    );
}

export function predictionsHash(legs: PredictionLeg[]): string {
  const lines = legs.map((leg) => `${leg.marketId}:${leg.outcomeIndex}:${leg.prediction}`);
  return sha256(stringToBytes(lines.join("\n")));
}

export interface SubmissionSignaturePayload {
  address: string;
  contest: string;
  legs: PredictionLeg[];
  /** ISO-8601. The server rejects anything outside a few minutes of now. */
  issuedAt: string;
}

/**
 * The string the wallet signs. The predictions go in as a hash rather than verbatim — 37 lines of
 * market addresses is not something anyone reads in a wallet prompt — but the hash binds them just
 * as tightly: the server rebuilds it from the legs it received. Same replay reasoning as
 * `profileSignatureMessage`: a replay can only resubmit identical predictions.
 */
export function submissionSignatureMessage(payload: SubmissionSignaturePayload): string {
  return [
    "Deep PM — submit predictions to the leaderboard",
    `Address: ${payload.address.toLowerCase()}`,
    `Contest: ${payload.contest}`,
    `Predictions: ${payload.legs.length}`,
    `Hash: ${predictionsHash(payload.legs)}`,
    `Issued at: ${payload.issuedAt}`,
  ].join("\n");
}

export const SUBMISSION_SIGNATURE_TTL_MS = 5 * 60 * 1000;
export const SUBMISSION_SIGNATURE_SKEW_MS = 60 * 1000;

/** What the score endpoint says about one wallet. The predictions themselves are never returned. */
export interface PredictionScore {
  contest: SubmissionContestId;
  /** ISO-8601 of the most recent submission. */
  submittedAt: string;
  /** 0–100, higher is better. Null until at least one predicted market has resolved. */
  score: number | null;
  /** Predicted markets that have resolved and count towards `score`. */
  scoredMarkets: number;
  /** Markets the submission covers. */
  totalMarkets: number;
}
