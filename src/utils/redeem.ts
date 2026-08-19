/**
 * Whether to offer "Redeem to sUSDS" at all.
 *
 * The button used to be unconditional: you clicked it and only then learned there was nothing to
 * claim. Hiding it is easy to get dangerously wrong, though, because "no redeemable balance" and
 * "we could not read the balances" look identical from the outside — `fetchTokensBalances`
 * swallows RPC failures and returns `[]` (see `@/hooks/useTokensBalances`), and a TanStack query
 * that is not enabled yet reports `isLoading: false` with `data: undefined`. A naive
 * `hasRedeemable && <Button/>` therefore flashes the button away on mount and, worse, removes the
 * user's only route to their money whenever an RPC hiccups.
 *
 * So this is deliberately tri-state: hide only on a *confident* negative, and keep showing the
 * button (disabled, with a reason) while we do not know.
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
