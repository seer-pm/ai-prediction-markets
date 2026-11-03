/**
 * Top-level views. The leaderboard is not a contest — it spans all of them — so it is a page of
 * its own reached from the header rather than a sixth entry in the contest tab bar.
 *
 * `round3-withdraw` is the first Round 3 market set, which was built wrongly and replaced. Nothing
 * in the app links to it: the people who traded it are sent its address directly, and everyone else
 * never sees it.
 *
 * `recover-positions` moves outcome tokens back into the trade wallet for people who used the
 * "Withdraw tokens" button removed on 2026-11-03. Also unlinked: it is sent to those people only.
 *
 * The URL is the source of truth, so a view is linkable and survives a reload. This needs the
 * SPA redirect in `netlify.toml`; without it a direct hit on a path 404s.
 */
export type View = "markets" | "leaderboard" | "round3-withdraw" | "recover-positions";

export const ROUND3_WITHDRAW_PATH = "/round3-withdraw";
export const RECOVER_POSITIONS_PATH = "/recover-positions";

export const PATHS: Record<View, string> = {
  markets: "/",
  leaderboard: "/leaderboard",
  "round3-withdraw": ROUND3_WITHDRAW_PATH,
  "recover-positions": RECOVER_POSITIONS_PATH,
};

export function viewFromPath(pathname: string): View {
  // Tolerate a trailing slash and any casing so `/Leaderboard/` is not silently the markets page.
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path === PATHS.leaderboard) return "leaderboard";
  if (path === PATHS["round3-withdraw"]) return "round3-withdraw";
  if (path === PATHS["recover-positions"]) return "recover-positions";
  return "markets";
}
