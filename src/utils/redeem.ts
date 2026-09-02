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

/**
 * What one outcome token of a market settles at, per outcome, as a fraction of the market's
 * collateral.
 *
 * The denominator is the sum of the reported numerators — that is exactly what the CTF stores in
 * `payoutDenominator` when `reportPayouts` runs, so this needs no extra chain read. An unresolved
 * market reports all-zero numerators, which falls out as all-zero ratios rather than a division by
 * zero.
 */
export function payoutRatios(payoutNumerators: readonly string[] | undefined): number[] {
  if (!payoutNumerators?.length) return [];
  const denominator = payoutNumerators.reduce((sum, numerator) => sum + Number(numerator), 0);
  if (!denominator) return payoutNumerators.map(() => 0);
  return payoutNumerators.map((numerator) => Number(numerator) / denominator);
}

/**
 * Settlement value of a held balance set, in whole collateral units.
 *
 * `balances` and `ratios` are both indexed by outcome, which is the order `wrappedTokens` comes
 * back in. Positions with a zero payout contribute nothing, so losing outcomes drop out on their
 * own — no filtering needed at the call site.
 */
export function redeemableValue(
  balances: readonly bigint[] | undefined,
  ratios: readonly number[],
  decimals: number,
): number {
  if (!balances?.length) return 0;
  const unit = 10 ** decimals;
  return balances.reduce((sum, balance, index) => {
    const ratio = ratios[index] ?? 0;
    if (ratio <= 0 || balance <= 0n) return sum;
    return sum + (Number(balance) / unit) * ratio;
  }, 0);
}

/** How many outcomes the wallet holds that actually pay out — what the estimate is made of. */
export function winningPositionCount(
  balances: readonly bigint[] | undefined,
  ratios: readonly number[],
): number {
  if (!balances?.length) return 0;
  return balances.filter((balance, index) => balance > 0n && (ratios[index] ?? 0) > 0).length;
}
