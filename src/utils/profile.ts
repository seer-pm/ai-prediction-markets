import { sha256, stringToBytes } from "viem";

/**
 * Wallet profiles — the display name, picture and X handle a participant can put on their
 * leaderboard row.
 *
 * Relative imports only in this file, and it has to stay that way. It is imported by
 * `netlify/functions/get-profiles.ts` and `save-profile.ts`, and Netlify's esbuild applies the
 * `@/*` mapping from `netlify/tsconfig.json` only to files under `netlify/functions/`. A `src/`
 * file it pulls in transitively keeps its own aliases unresolved: they survive into the bundle as
 * bare `@/utils/...` specifiers and the function dies at runtime with
 * "Cannot find package '@/utils'". Same trap documented at the top of `./contests.ts`.
 *
 * Every validator lives here rather than in the form, so the browser and the write endpoint
 * cannot disagree about what a valid profile is.
 */

export interface Profile {
  displayName?: string;
  avatarUrl?: string;
  xHandle?: string;
  /** ISO-8601, set by the server on write. */
  updatedAt: string;
}

export const MAX_DISPLAY_NAME = 32;
export const MAX_AVATAR_URL = 300;
/** X's own limit. */
export const MAX_X_HANDLE = 15;

/**
 * C0/C1 controls plus the zero-width and bidi-override characters. The latter are the ones that
 * matter here: a right-to-left override in a name reorders everything after it in the row.
 */
const INVISIBLE =
  // Stripping control characters is the point of this regex.
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Collapse whitespace, drop invisible characters, cap the length. Never throws. */
export function sanitizeDisplayName(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, MAX_DISPLAY_NAME);
}

/**
 * Why this name cannot be used, or null when it can. An empty name is valid — it means "no
 * display name", and the row falls back to ENS and then to the hex.
 *
 * The impersonation rules are the point: this label sits in a money table whose every row links
 * out to a block explorer, so a name may not dress itself up as an address or an ENS name. Same
 * reasoning as the homoglyph guard in `../config/ens.ts`.
 */
export function displayNameError(name: string): string | null {
  if (!name) return null;
  if (name.length > MAX_DISPLAY_NAME) return `Keep it to ${MAX_DISPLAY_NAME} characters or fewer.`;
  if (/^0x/i.test(name)) return "A name cannot start with 0x — that reads as a wallet address.";
  if (/\.eth$/i.test(name)) return "A name cannot end in .eth — that reads as an ENS name.";
  return null;
}

/** Accepts `foo`, `@foo`, `x.com/foo`, `twitter.com/foo` and the https forms of both. */
export function normalizeXHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function xHandleError(handle: string): string | null {
  if (!handle) return null;
  if (!/^[A-Za-z0-9_]+$/.test(handle)) return "Only letters, numbers and underscores.";
  if (handle.length > MAX_X_HANDLE) return `Handles are at most ${MAX_X_HANDLE} characters.`;
  return null;
}

export function normalizeAvatarUrl(raw: string): string {
  return raw.trim();
}

/**
 * https only. An http image would be blocked as mixed content on the deployed site anyway, and
 * `javascript:`/`data:` have no business in an `<img src>` we render for other people.
 */
export function avatarUrlError(url: string): string | null {
  if (!url) return null;
  if (url.length > MAX_AVATAR_URL) return `Keep the link under ${MAX_AVATAR_URL} characters.`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That is not a valid link.";
  }
  if (parsed.protocol !== "https:") return "The link has to start with https://.";
  return null;
}

export interface ProfileSignaturePayload {
  address: string;
  displayName: string;
  avatarUrl: string;
  xHandle: string;
  /** ISO-8601. The server rejects anything outside a few minutes of now. */
  issuedAt: string;
}

/**
 * The exact string the wallet signs to authorise a profile write.
 *
 * The payload is *inside* the message, which is what makes a nonce store unnecessary: a replayed
 * request can only rewrite the identical values, and `issuedAt` bounds how long it stays valid.
 * The server rebuilds this from the fields it received rather than trusting a message the client
 * sent, so the two can never describe different things.
 */
export function profileSignatureMessage(payload: ProfileSignaturePayload): string {
  return [
    "Deep PM — update profile",
    `Address: ${payload.address.toLowerCase()}`,
    `Name: ${payload.displayName}`,
    `Avatar: ${payload.avatarUrl}`,
    `X: ${payload.xHandle}`,
    `Issued at: ${payload.issuedAt}`,
  ].join("\n");
}

/** How long a signed profile update stays valid. */
export const PROFILE_SIGNATURE_TTL_MS = 5 * 60 * 1000;
/** Tolerance for a client clock that runs fast. */
export const PROFILE_SIGNATURE_SKEW_MS = 60 * 1000;

/**
 * The fallback avatar: a Gravatar identicon derived from the address.
 *
 * Gravatar builds the identicon from the hash alone, so hashing the address rather than an email
 * works exactly as well and gives every wallet a stable, distinct pattern — which is the whole
 * point in a table where most rows would otherwise be interchangeable grey circles.
 */
export function gravatarUrl(address: string, size = 64): string {
  const hash = sha256(stringToBytes(address.toLowerCase())).slice(2);
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}

/** True when the profile carries nothing worth storing — the signal to delete the row. */
export function isEmptyProfile(profile: Omit<Profile, "updatedAt">): boolean {
  return !profile.displayName && !profile.avatarUrl && !profile.xHandle;
}
