import { CHAIN_ID } from "@/utils/constants";
import {
  SUBMISSION_CONTESTS,
  isSubmissionContest,
  type PredictionLeg,
  type PredictionScore,
  type SubmissionContestId,
} from "@/utils/predictionSubmission";
import { MarketStatus } from "@seer-pm/sdk";
import { createClient } from "@supabase/supabase-js";
import { canonicalAddress, readOwnerMap } from "./executorOwners";
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

/**
 * Every address holding a submission in any of `contests` — canonical owners, as stored.
 *
 * Read from the keys alone: the address is the key's last segment, so no submission body leaves
 * the table. `_` is a LIKE wildcard, so the prefix is escaped — unescaped, `…_zcash_` would also
 * match `…_zcash-nu7_…` — and checked again exactly, in case the escape is ever lost upstream.
 */
export async function listSubmitters(contests: readonly SubmissionContestId[]): Promise<string[]> {
  const addresses = new Set<string>();
  for (const contest of contests) {
    const prefix = submissionKey(contest, "");
    const { data, error } = await supabase
      .from("key_value")
      .select("key")
      .like("key", `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (error) throw error;
    for (const { key } of data ?? []) {
      if (typeof key === "string" && key.startsWith(prefix)) addresses.add(key.slice(prefix.length));
    }
  }
  return [...addresses];
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

/** The contests a leaderboard scope reads submissions from: all of them globally, else its own. */
export function submissionContestsFor(scope: string): readonly SubmissionContestId[] {
  return scope === "global" ? SUBMISSION_CONTESTS : isSubmissionContest(scope) ? [scope] : [];
}

/**
 * Submission scores for `addresses`, keyed by the lowercased address as asked. Wallets that never
 * submitted are absent.
 *
 * `scope=global` scores each wallet's most recent submission in any contest; a contest scope scores
 * its submission in that contest. An executor address resolves to its owner's submission, which is
 * the identity submissions are stored under.
 */
export async function scoreAddresses(
  addresses: string[],
  scope: string,
): Promise<Record<string, PredictionScore>> {
  const contests = submissionContestsFor(scope);
  if (addresses.length === 0 || contests.length === 0) return {};

  const owners = await readOwnerMap();
  const canonicalOf = new Map(
    addresses.map((address) => {
      const lower = address.toLowerCase();
      return [lower, canonicalAddress(lower, owners)] as const;
    }),
  );
  const submissions = await readSubmissions(contests, [...new Set(canonicalOf.values())]);

  const latest = new Map<string, StoredSubmission>();
  for (const submission of submissions) {
    const current = latest.get(submission.address);
    if (!current || submission.submittedAt > current.submittedAt) {
      latest.set(submission.address, submission);
    }
  }

  // Only the contests somebody asked about actually submitted to cost an RPC read.
  const neededContests = [...new Set([...latest.values()].map((s) => s.contest))];
  const marketsByContest = new Map<SubmissionContestId, Map<string, MarketOnChain>>(
    await Promise.all(
      neededContests.map(async (contest) => [contest, await fetchContestMarkets(contest)] as const),
    ),
  );

  const scores: Record<string, PredictionScore> = {};
  for (const [address, canonical] of canonicalOf) {
    const submission = latest.get(canonical);
    const markets = submission && marketsByContest.get(submission.contest);
    if (submission && markets) scores[address] = scoreSubmission(submission, markets);
  }
  return scores;
}
