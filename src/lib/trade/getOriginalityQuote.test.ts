import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OriginalityTableData } from "@/types";

const quote = vi.fn();
vi.mock("./getQuoteFast", () => ({ getUniswapQuoteFast: (...args: unknown[]) => quote(...args) }));
vi.mock("@/hooks/useTokensBalances", () => ({ fetchTokensBalances: vi.fn() }));

import { getOriginalityQuotes, getSellAllQuotes, getSellFromBalanceQuotes } from "./getQuote";
import { QUOTE_ATTEMPTS } from "./settleWithRetry";

const ACCOUNT = "0x00000000000000000000000000000000000000aa";

/** A repository whose prediction is above UP: sell DOWN, buy UP. `wrappedTokens` is [DOWN, UP]. */
const row = (n: number, over: Partial<OriginalityTableData> = {}): OriginalityTableData => ({
  repo: `org/repo-${n}`,
  upPrice: 0.4,
  downPrice: 0.6,
  predictedOriginality: 0.5,
  upDifference: 0.1,
  downDifference: -0.1,
  marketId: `0x${n}`,
  hasPrediction: true,
  volumeUntilUpPrice: 5,
  volumeUntilDownPrice: 5,
  volumeUntilUpEqual: 0,
  volumeUntilDownEqual: 0,
  upBalance: 0n,
  downBalance: 0n,
  wrappedTokens: [`0x${n}d`, `0x${n}u`] as `0x${string}`[],
  collateralToken: `0x${n}c` as `0x${string}`,
  amount: "1",
  ...over,
});

/** The outcome token a quote call is for: argument 3 is the outcome token. */
const tokenOf = (args: unknown[]) => (args[3] as { address: string }).address;

const ok = (args: unknown[]) => ({
  value: 10n ** 17n,
  decimals: 18,
  buyToken: "0x",
  sellToken: tokenOf(args),
  sellAmount: "1",
  swapType: args[5],
  fee: 100,
  gasEstimate: 0n,
});

const failing = (...tokens: string[]) =>
  quote.mockImplementation(async (...args: unknown[]) => {
    if (tokens.includes(tokenOf(args))) throw new Error("HTTP request failed");
    return ok(args);
  });

/** Run with fake timers, so the retry pauses do not slow the suite. */
const settle = async <T,>(promise: Promise<T>) => {
  await vi.runAllTimersAsync();
  return promise;
};

describe("Round 3 quotes that fail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    quote.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("retries a repository whose quote failed once, and trades it", async () => {
    const seen = new Set<string>();
    quote.mockImplementation(async (...args: unknown[]) => {
      const token = tokenOf(args);
      if (token === "0x2d" && !seen.has(token)) {
        seen.add(token);
        throw new Error("HTTP request failed");
      }
      return ok(args);
    });

    const { results, failed } = await settle(
      getOriginalityQuotes({ account: ACCOUNT, tableData: [row(1), row(2), row(3)] }),
    );
    expect(failed).toHaveLength(0);
    expect(results.map((r) => r.row.repo)).toEqual(["org/repo-1", "org/repo-2", "org/repo-3"]);
  });

  it("reports a repository that fails every attempt, after exactly the attempt limit", async () => {
    failing("0x2d");
    const { results, failed } = await settle(
      getOriginalityQuotes({ account: ACCOUNT, tableData: [row(1), row(2), row(3)] }),
    );
    expect(failed.map((f) => f.row.repo)).toEqual(["org/repo-2"]);
    expect(results.map((r) => r.row.repo)).toEqual(["org/repo-1", "org/repo-3"]);
    // The DOWN sell is quoted once per attempt.
    expect(quote.mock.calls.filter((args) => tokenOf(args) === "0x2d")).toHaveLength(
      QUOTE_ATTEMPTS,
    );
  });

  it("does not sell one side of the UP+DOWN>1 arbitrage alone", async () => {
    failing("0x1u");
    const arb = row(1, { upPrice: 0.6, downPrice: 0.6, volumeUntilUpEqual: 2, volumeUntilDownEqual: 2 });
    const { results, failed } = await settle(
      getOriginalityQuotes({ account: ACCOUNT, tableData: [arb] }),
    );
    expect(results).toHaveLength(0);
    expect(failed.map((f) => f.row.repo)).toEqual(["org/repo-1"]);
  });

  it("reports a held position it could not price before minting", async () => {
    failing("0x1d");
    const held = row(1, { downBalance: 10n ** 17n });
    const { quotes, failed } = await settle(
      getSellFromBalanceQuotes({ account: ACCOUNT, tableData: [held] }),
    );
    expect(quotes).toHaveLength(0);
    expect(failed.map((f) => f.row.repo)).toEqual(["org/repo-1"]);
  });

  it("Sell all retries and reports a position it could not price", async () => {
    failing("0x1u");
    const held = [row(1, { upBalance: 10n ** 17n }), row(2, { downBalance: 10n ** 17n })];
    const { quotes, failed } = await settle(getSellAllQuotes({ account: ACCOUNT, tableData: held }));
    expect(quotes.map((q) => q.sellToken)).toEqual(["0x2d"]);
    expect(failed.map((f) => f.row.repo)).toEqual(["org/repo-1"]);
  });
});
