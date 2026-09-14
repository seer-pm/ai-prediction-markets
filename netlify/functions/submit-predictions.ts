import { CHAIN_ID } from "@/utils/constants";
import {
  MAX_SUBMISSION_LEGS,
  SUBMISSION_SIGNATURE_SKEW_MS,
  SUBMISSION_SIGNATURE_TTL_MS,
  isSubmissionContest,
  submissionSignatureMessage,
  type PredictionLeg,
} from "@/utils/predictionSubmission";
import type { Address, Hex } from "viem";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap } from "./utils/executorOwners";
import { getPublicClientByChainId } from "./utils/pnl/config";
import {
  acceptsPredictions,
  fetchContestMarkets,
  readSubmissions,
  writeSubmission,
  type StoredLeg,
} from "./utils/predictionSubmissions";

/**
 * Store a participant's predictions for the leaderboard score.
 *
 * Authorised exactly like `save-profile`: a wallet signature over a message rebuilt here from the
 * received fields, bounded by `issuedAt`, verified through the public client so contract wallets
 * (ERC-1271/6492) work.
 *
 * Two integrity rules make the score mean something:
 *
 * - A leg on a market that already has an answer is dropped, not stored — see `acceptsPredictions`.
 * - Resubmitting replaces the legs on markets still open but keeps the earlier legs on markets that
 *   have since been answered. Otherwise a resubmission after one market's answer would silently
 *   throw away the prediction that was made in time.
 */

const METHODS = "POST, OPTIONS";

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

interface SubmitBody {
  address?: string;
  contest?: string;
  legs?: unknown;
  issuedAt?: string;
  signature?: string;
}

/** Shape-checks without normalising: the hash has to be rebuilt from the values as received. */
function parseLegs(raw: unknown): PredictionLeg[] | null {
  if (!Array.isArray(raw)) return null;
  const legs: PredictionLeg[] = [];
  for (const item of raw) {
    const leg = item as Partial<PredictionLeg> | null;
    if (
      !leg ||
      typeof leg.marketId !== "string" ||
      !/^0x[a-f0-9]{40}$/.test(leg.marketId) ||
      typeof leg.outcomeIndex !== "number" ||
      !Number.isInteger(leg.outcomeIndex) ||
      leg.outcomeIndex < 0 ||
      typeof leg.prediction !== "number" ||
      !Number.isFinite(leg.prediction) ||
      leg.prediction < 0 ||
      leg.prediction > 1
    ) {
      return null;
    }
    legs.push({ marketId: leg.marketId, outcomeIndex: leg.outcomeIndex, prediction: leg.prediction });
  }
  return legs;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req, METHODS);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req, METHODS);

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405, corsHeaders);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SubmitBody;

    const address = (body.address ?? "").trim().toLowerCase();
    const contest = (body.contest ?? "").trim();
    const signature = (body.signature ?? "").trim();
    const issuedAt = (body.issuedAt ?? "").trim();

    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return jsonResponse({ error: "address must be 0x-prefixed" }, 400, corsHeaders);
    }
    if (!isSubmissionContest(contest)) {
      return jsonResponse({ error: `contest does not take submissions: ${contest}` }, 400, corsHeaders);
    }
    if (!/^0x[a-fA-F0-9]+$/.test(signature)) {
      return jsonResponse({ error: "signature is missing or malformed" }, 400, corsHeaders);
    }

    const issuedAtMs = Date.parse(issuedAt);
    if (Number.isNaN(issuedAtMs)) {
      return jsonResponse({ error: "issuedAt must be an ISO-8601 timestamp" }, 400, corsHeaders);
    }
    const age = Date.now() - issuedAtMs;
    if (age > SUBMISSION_SIGNATURE_TTL_MS || age < -SUBMISSION_SIGNATURE_SKEW_MS) {
      return jsonResponse({ error: "This request expired. Please sign again." }, 401, corsHeaders);
    }

    const legs = parseLegs(body.legs);
    if (!legs || legs.length === 0 || legs.length > MAX_SUBMISSION_LEGS) {
      return jsonResponse(
        { error: `legs must be 1–${MAX_SUBMISSION_LEGS} predictions in [0, 1]` },
        400,
        corsHeaders,
      );
    }

    const client = getPublicClientByChainId(CHAIN_ID);
    const valid = await client.verifyMessage({
      address: address as Address,
      message: submissionSignatureMessage({ address, contest, legs, issuedAt }),
      signature: signature as Hex,
    });
    if (!valid) {
      return jsonResponse({ error: "That signature does not match." }, 401, corsHeaders);
    }

    const seen = new Set<string>();
    for (const leg of legs) {
      const key = `${leg.marketId}:${leg.outcomeIndex}`;
      if (seen.has(key)) {
        return jsonResponse({ error: `duplicate prediction for ${key}` }, 400, corsHeaders);
      }
      seen.add(key);
    }

    const markets = await fetchContestMarkets(contest);
    for (const leg of legs) {
      const market = markets.get(leg.marketId);
      if (!market) {
        return jsonResponse({ error: `${leg.marketId} is not in ${contest}` }, 400, corsHeaders);
      }
      // Invalid is always last and is never predicted.
      if (leg.outcomeIndex >= market.outcomes.length - 1) {
        return jsonResponse(
          { error: `${leg.marketId} has no outcome ${leg.outcomeIndex}` },
          400,
          corsHeaders,
        );
      }
    }

    const owners = await readOwnerMap();
    const canonical = canonicalAddress(address, owners);
    const [previous] = await readSubmissions([contest], [canonical]);

    const submittedAt = new Date().toISOString();
    const accepted: StoredLeg[] = legs
      .filter((leg) => acceptsPredictions(markets.get(leg.marketId)!))
      .map((leg) => ({ ...leg, submittedAt }));
    const carriedOver = (previous?.legs ?? []).filter((leg) => {
      const market = markets.get(leg.marketId);
      return market && !acceptsPredictions(market);
    });

    if (accepted.length === 0) {
      return jsonResponse(
        { error: "Every market in this submission already has an answer, so nothing was submitted." },
        409,
        corsHeaders,
      );
    }

    await writeSubmission({
      contest,
      address: canonical,
      submittedAt,
      legs: [...carriedOver, ...accepted],
    });

    return jsonResponse(
      {
        address: canonical,
        contest,
        submittedAt,
        accepted: accepted.length,
        ignored: legs.length - accepted.length,
        carriedOver: carriedOver.length,
      },
      200,
      corsHeaders,
    );
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
