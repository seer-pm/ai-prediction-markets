import type { OriginalityTableData } from "@/types";
import { describe, expect, it } from "vitest";
import { ORIGINALITY_UP_INDEX, originalityPredictionLegs } from "./originalitySubmission";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";
const FOREIGN = "0x00000000000000000000000000000000000000ff";

const row = (marketId: string, predictedOriginality: number | null) =>
  ({ repo: marketId, marketId, predictedOriginality }) as OriginalityTableData;

describe("originalityPredictionLegs", () => {
  it("submits each predicted repo against its UP outcome", () => {
    expect(originalityPredictionLegs([row(A, 0.6), row(B, 0)], [A, B])).toEqual([
      { marketId: A, outcomeIndex: ORIGINALITY_UP_INDEX, prediction: 0.6 },
      { marketId: B, outcomeIndex: ORIGINALITY_UP_INDEX, prediction: 0 },
    ]);
    expect(ORIGINALITY_UP_INDEX).toBe(1);
  });

  it("leaves out a repo with no prediction rather than submitting it as 0", () => {
    expect(originalityPredictionLegs([row(A, null), row(B, 0.3)], [A, B]).map((leg) => leg.marketId)).toEqual([B]);
  });

  // The endpoint rejects the whole submission over one bad leg.
  it("drops anything the endpoint would refuse", () => {
    const rows = [row(FOREIGN, 0.5), row(A, 1.2), row(B, Number.NaN), row(B, -0.1)];
    expect(originalityPredictionLegs(rows, [A, B])).toEqual([]);
  });

  it("matches market ids whatever their case, and sends them lowercased", () => {
    const upper = `0x${A.slice(2).toUpperCase()}`;
    expect(originalityPredictionLegs([row(upper, 0.4)], [A])).toEqual([
      { marketId: A, outcomeIndex: ORIGINALITY_UP_INDEX, prediction: 0.4 },
    ]);
    expect(originalityPredictionLegs([row(A, 0.4)], [upper])).toHaveLength(1);
  });

  it("sends one leg per market", () => {
    expect(originalityPredictionLegs([row(A, 0.4), row(A, 0.9)], [A])).toHaveLength(1);
  });
});
