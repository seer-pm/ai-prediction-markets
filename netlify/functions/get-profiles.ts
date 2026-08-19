import type { Profile } from "@/utils/profile";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap } from "./utils/executorOwners";
import { readProfiles } from "./utils/profiles";

/**
 * Wallet profiles for a batch of addresses: `?addresses=0xa,0xb,0xc`.
 *
 * Each input is canonicalised before the lookup, so asking about a trade-executor contract
 * returns its owner's profile — the same identity the leaderboard ranks under. The response is
 * keyed by the address that was *asked about*, so the caller can look up what it passed in.
 *
 * Deliberately not edge-cached, unlike the other read functions: this is the one endpoint whose
 * answer a user changes themselves, and a 60 s CDN cache would hide their own save from them.
 * The client caches it in React Query instead.
 */

/** One leaderboard page is 25; 200 leaves room for the whole board in one call. */
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
    const requested = (url.searchParams.get("addresses") ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean);

    if (requested.length === 0) {
      return jsonResponse({ profiles: {} }, 200, corsHeaders);
    }
    if (requested.length > MAX_ADDRESSES) {
      return jsonResponse({ error: `at most ${MAX_ADDRESSES} addresses` }, 400, corsHeaders);
    }
    if (requested.some((address) => !/^0x[a-f0-9]{40}$/.test(address))) {
      return jsonResponse({ error: "addresses must be 0x-prefixed" }, 400, corsHeaders);
    }

    const owners = await readOwnerMap();
    const canonicalOf = new Map(
      requested.map((address) => [address, canonicalAddress(address, owners)]),
    );
    const stored = await readProfiles([...new Set(canonicalOf.values())]);

    const profiles: Record<string, Profile> = {};
    for (const [address, canonical] of canonicalOf) {
      const profile = stored[canonical];
      if (profile) profiles[address] = profile;
    }

    return jsonResponse({ profiles }, 200, corsHeaders);
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
