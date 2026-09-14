import { CHAIN_ID } from "@/utils/constants";
import type {
  PredictionLeg,
  PredictionScore,
  SubmissionContestId,
} from "@/utils/predictionSubmission";
import { MarketStatus } from "@seer-pm/sdk";
import { createClient } from "@supabase/supabase-js";
import type { MarketOnChain } from "./marketView";
import { fetchZcashMarketsOnChain } from "./zcashOnChain";
import { fetchZcashNu7MarketsOnChain } from "./zcashNu7OnChain";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * Leaderboard prediction submissions, one row per participant per contest — the last submission
 * only, which is what gets scored.
 *
 * `key_value` for the same reason as `./profiles.ts`: no migration runner against a Supabase shared
 * with Seer. Keyed by the canonical (owner EOA) address, so a participant who trades through an
 * executor has one submission, under the identity the leaderboard ranks them by.
 *
 * Nothing in here is ever returned to a browser verbatim. The only read endpoint,
 * `get-prediction-scores`, reduces a submission to a score.
 */

export interface StoredLeg extends PredictionLeg {
  /** When this leg was submitted. Legs carried over from an earlier submission keep their own. */
  submittedAt: string;
}

export interface StoredSubmission {
  contest: SubmissionContestId;
  address: string;
  submittedAt: string;
  legs: StoredLeg[];
}

export function submissionKey(contest: SubmissionContestId, address: string): string {
  return `deep_pm_prediction_submission_${CHAIN_ID}_${contest}_${address.toLowerCase()}`;
}

/** Supabase caps `.in()` payloads; same chunk size as the profile reads. */
const READ_CHUNK = 100;

export async function readSubmissions(
  contests: readonly SubmissionContestId[],
  addresses: string[],
): Promise<StoredSubmission[]> {
  const keys = [
    ...new Set(contests.flatMap((contest) => addresses.map((a) => submissionKey(contest, a)))),
  ];
  const submissions: StoredSubmission[] = [];

  for (let i = 0; i < keys.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from("key_value")
      .select("value")
      .in("key", keys.slice(i, i + READ_CHUNK));
    if (error) throw error;
    for (const row of data ?? []) {
      const value = row.value as StoredSubmission | undefined;
      if (value?.legs) submissions.push(value);
    }
  }

  return submissions;
}

export async function writeSubmission(submission: StoredSubmission): Promise<void> {
  const { error } = await supabase
    .from("key_value")
    .upsert(
      { key: submissionKey(submission.contest, submission.address), value: submission },
      { onConflict: "key" },
    );
  if (error) throw error;
}

const MARKET_FETCHERS: Record<SubmissionContestId, () => Promise<MarketOnChain[]>> = {
  zcash: fetchZcashMarketsOnChain,
  "zcash-nu7": fetchZcashNu7MarketsOnChain,
};

/** The contest's markets read on chain, keyed by lowercased address. */
export async function fetchContestMarkets(
  contest: SubmissionContestId,
): Promise<Map<string, MarketOnChain>> {
  const markets = await MARKET_FETCHERS[contest]();
  return new Map(markets.map((market) => [market.id.toLowerCase(), market]));
}

/**
 * Whether a prediction on this market can still be taken.
 *
 * Not "is trading still open": both live contests read `open` while they trade, because their
 * Reality questions opened for answers before the ballots closed. The line is the first posted
 * answer — past it the result is public, and a prediction submitted then would be scored against
 * something the submitter could already see.
 */
export function acceptsPredictions(market: MarketOnChain): boolean {
  return market.marketStatus === MarketStatus.NOT_OPEN || market.marketStatus === MarketStatus.OPEN;
}

/** Each outcome's share of the payout, or null when the market has nothing to score against. */
function payoutShares(market: MarketOnChain): number[] | null {
  if (market.marketStatus !== MarketStatus.CLOSED) return null;
  const numerators = market.payoutNumerators.map(Number);
  const total = numerators.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  // Settled wholly on Invalid (always the last outcome in both contests): there is no answer to
  // have been right or wrong about, so the market drops out rather than scoring everyone zero.
  if (numerators[numerators.length - 1] === total) return null;
  return numerators.map((value) => value / total);
}

/**
 * 100 × (1 − mean absolute error) over every predicted outcome whose market has resolved, so higher
 * is better and the number reads directly: 88 means off by 12 points on average. A leg is compared
 * to its outcome's payout share, which is 1 or 0 for a clean resolution. Always predicting 0.5 lands
 * at 50.
 *
 * Absolute rather than squared error is a deliberate product choice. It is not a proper scoring
 * rule: someone who believes 0.7 minimises expected error by submitting 1, so it rewards rounding
 * to 0 or 1 over reporting the probability actually held. Squared error (Brier) does not have that
 * incentive, if the ranking ever needs to reward calibration instead.
 */
export function scoreSubmission(
  submission: StoredSubmission,
  markets: Map<string, MarketOnChain>,
): PredictionScore {
  let absoluteError = 0;
  let scoredLegs = 0;
  const scoredMarkets = new Set<string>();
  const allMarkets = new Set<string>();

  for (const leg of submission.legs) {
    allMarkets.add(leg.marketId);
    const market = markets.get(leg.marketId);
    const shares = market ? payoutShares(market) : null;
    const actual = shares?.[leg.outcomeIndex];
    if (actual === undefined) continue;
    absoluteError += Math.abs(leg.prediction - actual);
    scoredLegs += 1;
    scoredMarkets.add(leg.marketId);
  }

  return {
    contest: submission.contest,
    submittedAt: submission.submittedAt,
    score: scoredLegs > 0 ? Math.round((1 - absoluteError / scoredLegs) * 1000) / 10 : null,
    scoredMarkets: scoredMarkets.size,
    totalMarkets: allMarkets.size,
  };
}
