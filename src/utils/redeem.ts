/**
 * Whether to offer "Redeem to sUSDS" at all.
 *
 * The button is only rendered on a *confident* positive: we have read every balance the answer
 * depends on and at least one of them is claimable. Anything else hides it.
 *
 * The distinction that matters is between "really nothing to claim" and "we could not read the
 * balances" — `fetchTokensBalances` swallows RPC failures and returns `[]` (see
 * `@/hooks/useTokensBalances`), and a TanStack query that is not enabled yet reports
 * `isLoading: false` with `data: undefined`. Both look exactly like an empty wallet. That is why
 * this stays tri-state rather than collapsing to a boolean: `"unknown"` still means "we do not
 * know", it just no longer renders a placeholder CTA. Showing the button while unknown made it
 * flash in on load and vanish a moment later, which reads as broken; a half-read balance set must
 * not advertise a claim. Callers that also render explanatory copy (see `AiMarkets`) can still key
 * off `"unknown"` to avoid promising a payout they have not confirmed.
 */
export type RedeemAvailability = "unknown" | "none" | "some";

export function redeemAvailability(args: {
  hasRedeemable: boolean;
  /**
   * True only when every input the answer depends on has genuinely arrived — market data loaded
   * *and* each balance read returned as many balances as tokens it was asked about. That length
   * check is what separates "really empty" from the error-swallowed `[]`.
   */
  isResolved: boolean;
}): RedeemAvailability {
  if (args.hasRedeemable) return "some";
  return args.isResolved ? "none" : "unknown";
}

/** True when a balance read actually answered for every token, rather than failing or not running. */
export function balancesResolved(balances: readonly bigint[] | undefined, tokens: readonly unknown[]): boolean {
  return tokens.length === 0 || balances?.length === tokens.length;
}
