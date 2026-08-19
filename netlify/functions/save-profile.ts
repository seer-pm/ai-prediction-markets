import { CHAIN_ID } from "@/utils/constants";
import {
  PROFILE_SIGNATURE_SKEW_MS,
  PROFILE_SIGNATURE_TTL_MS,
  avatarUrlError,
  displayNameError,
  isEmptyProfile,
  normalizeAvatarUrl,
  normalizeXHandle,
  profileSignatureMessage,
  sanitizeDisplayName,
  xHandleError,
  type Profile,
} from "@/utils/profile";
import type { Address, Hex } from "viem";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap } from "./utils/executorOwners";
import { getPublicClientByChainId } from "./utils/pnl/config";
import { deleteProfile, writeProfile } from "./utils/profiles";

/**
 * The only write endpoint in this app, and the only one that authenticates anything.
 *
 * Authorisation is a wallet signature over a message that contains the payload itself, so there
 * is no session, no cookie and no server-side nonce to store: a replayed request can only rewrite
 * the values it already carried, and `issuedAt` bounds the window in which it does anything at
 * all. The message is rebuilt here from the received fields — a client-supplied message string
 * would let the signer approve one thing and the server store another.
 *
 * Verification goes through the public client rather than viem's standalone `verifyMessage` so
 * ERC-1271/6492 signatures work: plenty of participants here act through contracts.
 */

const METHODS = "POST, OPTIONS";

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

interface SaveProfileBody {
  address?: string;
  displayName?: string;
  avatarUrl?: string;
  xHandle?: string;
  issuedAt?: string;
  signature?: string;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req, METHODS);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req, METHODS);

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405, corsHeaders);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SaveProfileBody;

    const address = (body.address ?? "").trim().toLowerCase();
    const signature = (body.signature ?? "").trim();
    const issuedAt = (body.issuedAt ?? "").trim();

    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return jsonResponse({ error: "address must be 0x-prefixed" }, 400, corsHeaders);
    }
    if (!/^0x[a-fA-F0-9]+$/.test(signature)) {
      return jsonResponse({ error: "signature is missing or malformed" }, 400, corsHeaders);
    }

    const issuedAtMs = Date.parse(issuedAt);
    if (Number.isNaN(issuedAtMs)) {
      return jsonResponse({ error: "issuedAt must be an ISO-8601 timestamp" }, 400, corsHeaders);
    }
    const age = Date.now() - issuedAtMs;
    if (age > PROFILE_SIGNATURE_TTL_MS || age < -PROFILE_SIGNATURE_SKEW_MS) {
      return jsonResponse({ error: "This request expired. Please sign again." }, 401, corsHeaders);
    }

    // Verify against the strings exactly as received — that is what the wallet put in front of
    // the user. Normalising first and verifying the result would silently require every client to
    // apply byte-identical normalisation before signing, and any drift would surface as an
    // unexplainable "signature does not match" rather than as the cosmetic difference it is.
    const rawDisplayName = String(body.displayName ?? "");
    const rawAvatarUrl = String(body.avatarUrl ?? "");
    const rawXHandle = String(body.xHandle ?? "");

    const message = profileSignatureMessage({
      address,
      displayName: rawDisplayName,
      avatarUrl: rawAvatarUrl,
      xHandle: rawXHandle,
      issuedAt,
    });
    const client = getPublicClientByChainId(CHAIN_ID);
    const valid = await client.verifyMessage({
      address: address as Address,
      message,
      signature: signature as Hex,
    });
    if (!valid) {
      return jsonResponse({ error: "That signature does not match." }, 401, corsHeaders);
    }

    // Only now clean them up. Validation runs on what would actually be stored and shown, so the
    // impersonation rules cannot be slipped past with padding.
    const displayName = sanitizeDisplayName(rawDisplayName);
    const avatarUrl = normalizeAvatarUrl(rawAvatarUrl);
    const xHandle = normalizeXHandle(rawXHandle);

    const invalid =
      displayNameError(displayName) ?? avatarUrlError(avatarUrl) ?? xHandleError(xHandle);
    if (invalid) {
      return jsonResponse({ error: invalid }, 400, corsHeaders);
    }

    // Stored under the owner EOA, so one participant has one profile however many wallets they
    // trade from — the same identity `rollUpRows` ranks under.
    const owners = await readOwnerMap();
    const canonical = canonicalAddress(address, owners);

    if (isEmptyProfile({ displayName, avatarUrl, xHandle })) {
      await deleteProfile(canonical);
      return jsonResponse({ address: canonical, profile: null }, 200, corsHeaders);
    }

    const profile: Profile = {
      ...(displayName ? { displayName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(xHandle ? { xHandle } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeProfile(canonical, profile);

    return jsonResponse({ address: canonical, profile }, 200, corsHeaders);
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
