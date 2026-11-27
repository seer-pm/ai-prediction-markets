import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZcashTableData } from "@/types";

const quote = vi.fn();
vi.mock("./getQuote", () => ({ getUniswapQuote: (...args: unknown[]) => quote(...args) }));

import { getSellAllZcashQuotes, getZcashQuotes, ZCASH_QUOTE_ATTEMPTS } from "./getZcashQuote";

const ACCOUNT = "0x00000000000000000000000000000000000000aa";

/** A market the plan trades on both pools: the prediction is 0.10 above YES. */
const row = (n: number, over: Partial<ZcashTableData> = {}): ZcashTableData => ({
  project: `Proposal ${n}`,
  applicant: "",
  requestedUsd: 0,
  tier: "",
  yesPrice: 0.52,
  noPrice: 0.48,
  predictedProbability: 0.62,
  yesDifference: 0.1,
  noDifference: -0.1,
  marketId: `0x${n}`,
  hasPrediction: true,
  volumeUntilYesPrice: 13,
  volumeUntilNoPrice: 25,
  volumeUntilYesEqual: 0,
  volumeUntilNoEqual: 0,
  yesBalance: 0n,
  noBalance: 0n,
  wrappedTokens: [`0x${n}a`, `0x${n}b`, `0x${n}c`] as `0x${string}`[],
  collateralToken: "0x00000000000000000000000000000000000000cc",
  amount: "5",
  ...over,
});

/** The outcome token a quote call is for: argument 3 is the outcome token. */
const tokenOf = (args: unknown[]) => (args[3] as { address: string }).address;

const ok = (args: unknown[]) => ({
  value: 10n ** 16n,
  decimals: 18,
  buyToken: "0x",
  sellToken: tokenOf(args),
  sellAmount: "1",
  swapType: args[5],
  fee: 100,
  gasEstimate: 0n,
});

/** Run with fake timers, so the retry pauses do not slow the suite. */
const settle = async <T,>(promise: Promise<T>) => {
  await vi.runAllTimersAsync();
  return promise;
};

describe("Zcash quotes that fail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    quote.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("retries a market whose quote failed, and trades it", async () => {
    const failedOnce = new Set<string>();
    quote.mockImplementation(async (...args: unknown[]) => {
      const token = tokenOf(args);
      if (token.startsWith("0x2") && !failedOnce.has(token)) {
        failedOnce.add(token);
        throw new Error("HTTP request failed");
      }
      return ok(args);
    });

    const { results, failed } = await settle(
      getZcashQuotes({ account: ACCOUNT, tableData: [row(1), row(2), row(3)] }),
    );

    expect(failed).toHaveLength(0);
    expect(results.map((r) => r.row.project)).toEqual(["Proposal 1", "Proposal 2", "Proposal 3"]);
  });

  it("reports a market that fails every attempt, and leaves none of its legs in the run", async () => {
    quote.mockImplementation(async (...args: unknown[]) => {
      // Only the NO sell of market 2 fails: its YES buy alone must not go through.
      if (tokenOf(args) === "0x2b") throw new Error("HTTP request failed");
      return ok(args);
    });

    const { results, failed } = await settle(
      getZcashQuotes({ account: ACCOUNT, tableData: [row(1), row(2), row(3)] }),
    );

    expect(failed.map((f) => f.row.project)).toEqual(["Proposal 2"]);
    expect(results.map((r) => r.row.project)).toEqual(["Proposal 1", "Proposal 3"]);
    const market2Calls = quote.mock.calls.filter((args) => tokenOf(args) === "0x2b");
    expect(market2Calls).toHaveLength(ZCASH_QUOTE_ATTEMPTS);
  });

  it("Sell all retries and reports a position it could not price", async () => {
    quote.mockImplementation(async (...args: unknown[]) => {
      if (tokenOf(args) === "0x1a") throw new Error("HTTP request failed");
      return ok(args);
    });

    const held = [
      row(1, { yesBalance: 10n ** 16n }),
      row(2, { noBalance: 10n ** 16n }),
    ];
    const { quotes, failed } = await settle(
      getSellAllZcashQuotes({ account: ACCOUNT, tableData: held }),
    );

    expect(quotes.map((q) => q.sellToken)).toEqual(["0x2b"]);
    expect(failed.map((f) => f.row.project)).toEqual(["Proposal 1"]);
  });
});
