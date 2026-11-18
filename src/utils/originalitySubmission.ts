import type { OriginalityTableData } from "@/types";
import type { PredictionLeg } from "./predictionSubmission";

/**
 * A repo market is scalar, with outcomes `[DOWN, UP, Invalid result]` — read off all 98 Round 3
 * markets on chain. The CSV's originality is the price it compares against UP, so UP is what a
 * prediction is submitted against.
 */
export const ORIGINALITY_UP_INDEX = 1;

/**
 * The legs a set of Originality rows submits: one per repo that was given a number, traded or not —
 * the prediction is what gets scored.
 *
 * Filtered to `marketIds` and to [0, 1] even though the table and the CSV parser already hold both:
 * the write endpoint rejects the whole submission over a single bad leg, so one stray row would cost
 * someone every prediction they made.
 */
export function originalityPredictionLegs(
  rows: readonly OriginalityTableData[],
  marketIds: readonly string[],
): PredictionLeg[] {
  const allowed = new Set(marketIds.map((id) => id.toLowerCase()));
  const seen = new Set<string>();
  const legs: PredictionLeg[] = [];
  for (const row of rows) {
    const marketId = row.marketId?.toLowerCase();
    const prediction = row.predictedOriginality;
    if (!marketId || !allowed.has(marketId) || seen.has(marketId)) continue;
    if (prediction === null || !Number.isFinite(prediction) || prediction < 0 || prediction > 1) continue;
    seen.add(marketId);
    legs.push({ marketId, outcomeIndex: ORIGINALITY_UP_INDEX, prediction });
  }
  return legs;
}
