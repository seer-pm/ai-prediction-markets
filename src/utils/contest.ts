/**
 * Why the trade actions can't be used yet. Surfaced as a tooltip on the
 * disabled button, rather than the button simply not rendering.
 */
export function tradeDisabledReason({
  hasPredictions,
  hasDifferences,
  isLoading,
}: {
  hasPredictions: boolean;
  hasDifferences: boolean;
  isLoading: boolean;
}): string | undefined {
  if (isLoading) return "Waiting for market data.";
  if (!hasPredictions) return "Upload a predictions CSV first.";
  if (!hasDifferences) {
    return "Every prediction already matches the market — there is nothing to trade.";
  }
  return undefined;
}
