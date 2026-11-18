import { MarketStatus } from "@seer-pm/sdk";
import { describe, expect, it, vi } from "vitest";
import type { MarketOnChain } from "./marketView";

// The module builds a Supabase client at import from `.env`'s real credentials. Nothing in this
// file may reach it: a stray write would put a test address on the live board.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () =>
    new Proxy(
      {},
      {
        get: () => {
          throw new Error("no Supabase in tests");
        },
      },
    ),
}));
vi.mock("./executorOwners", () => ({
  canonicalAddress: (address: string) => address.toLowerCase(),
  readOwnerMap: async () => ({}),
}));

const { scoreSubmission } = await import("./predictionSubmissions");

const REPO = "0x00000000000000000000000000000000000000aa";
const SUBMITTED_AT = "2026-11-18T00:00:00.000Z";

const scalar = (marketStatus: MarketStatus, payoutNumerators: string[]) =>
  new Map([
    [
      REPO,
      {
        id: REPO,
        outcomes: ["DOWN", "UP", "Invalid result"],
        marketStatus,
        payoutNumerators,
      } as unknown as MarketOnChain,
    ],
  ]);

const submission = (outcomeIndex: number, prediction: number) => ({
  contest: "round3" as const,
  address: "0x00000000000000000000000000000000000000a1",
  submittedAt: SUBMITTED_AT,
  legs: [{ marketId: REPO, outcomeIndex, prediction, submittedAt: SUBMITTED_AT }],
});

describe("scoring a Round 3 (scalar) submission", () => {
  it("compares UP with the jury value's place in the range", () => {
    // Jury value 70 of 100 pays UP 0.7; a 0.6 prediction is 10 points off.
    const score = scoreSubmission(submission(1, 0.6), scalar(MarketStatus.CLOSED, ["30", "70", "0"]));
    expect(score).toMatchObject({ score: 90, scoredMarkets: 1, totalMarkets: 1 });
  });

  it("scores a DOWN leg against the mirror share", () => {
    const score = scoreSubmission(submission(0, 0.4), scalar(MarketStatus.CLOSED, ["30", "70", "0"]));
    expect(score.score).toBe(90);
  });

  it("drops a market that settled on Invalid instead of scoring it", () => {
    const score = scoreSubmission(submission(1, 0.6), scalar(MarketStatus.CLOSED, ["0", "0", "1"]));
    expect(score).toMatchObject({ score: null, scoredMarkets: 0, totalMarkets: 1 });
  });

  it("waits for a market that has not resolved", () => {
    const score = scoreSubmission(submission(1, 0.6), scalar(MarketStatus.OPEN, ["0", "0", "0"]));
    expect(score).toMatchObject({ score: null, scoredMarkets: 0 });
  });
});
