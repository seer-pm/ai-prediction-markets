import { isContestId } from "@/utils/contests";
import {
  SUBMISSION_CONTESTS,
  isSubmissionContest,
  type PredictionScore,
  type SubmissionContestId,
} from "@/utils/predictionSubmission";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap } from "./utils/executorOwners";
import type { MarketOnChain } from "./utils/marketView";
import {
  fetchContestMarkets,
  readSubmissions,
  scoreSubmission,
  type StoredSubmission,
} from "./utils/predictionSubmissions";

/**
 * Leaderboard submission scores for a batch of addresses: `?addresses=0xa,0xb&scope=global`.
 *
 * Only ever a score. The predictions stay in the backend — a market that has not resolved yet
 * contributes nothing to the answer, so nothing here reveals what anyone predicted on it.
 *
 * `scope=global` scores each wallet's most recent submission in any contest; a contest scope scores
 * its submission in that contest. Contests that take no submissions answer with no scores.
 *
 * Not edge-cached, for the same reason as `get-profiles`: a participant's own submission should show
 * up on their row as soon as they have made it.
 */

const MAX_ADDRESSES = 200;

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const scope = (url.searchParams.get("scope") ?? "global").toLowerCase();
    const requested = (url.searchParams.get("addresses") ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean);

    if (scope !== "global" && !isContestId(scope)) {
      return jsonResponse({ error: `unknown scope: ${scope}` }, 400, corsHeaders);
    }
    if (requested.length > MAX_ADDRESSES) {
      return jsonResponse({ error: `at most ${MAX_ADDRESSES} addresses` }, 400, corsHeaders);
    }
    if (requested.some((address) => !/^0x[a-f0-9]{40}$/.test(address))) {
      return jsonResponse({ error: "addresses must be 0x-prefixed" }, 400, corsHeaders);
    }

    const contests: readonly SubmissionContestId[] =
      scope === "global" ? SUBMISSION_CONTESTS : isSubmissionContest(scope) ? [scope] : [];
    if (requested.length === 0 || contests.length === 0) {
      return jsonResponse({ scores: {} }, 200, corsHeaders);
    }

    const owners = await readOwnerMap();
    const canonicalOf = new Map(
      requested.map((address) => [address, canonicalAddress(address, owners)]),
    );
    const submissions = await readSubmissions(contests, [...new Set(canonicalOf.values())]);

    const latest = new Map<string, StoredSubmission>();
    for (const submission of submissions) {
      const current = latest.get(submission.address);
      if (!current || submission.submittedAt > current.submittedAt) {
        latest.set(submission.address, submission);
      }
    }

    // Only the contests somebody on this page actually submitted to cost an RPC read.
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

    return jsonResponse({ scores }, 200, corsHeaders);
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
