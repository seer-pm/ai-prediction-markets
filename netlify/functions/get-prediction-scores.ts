import { isContestId } from "@/utils/contests";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { scoreAddresses } from "./utils/predictionSubmissions";

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

    const scores = await scoreAddresses(requested, scope);
    return jsonResponse({ scores }, 200, corsHeaders);
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
