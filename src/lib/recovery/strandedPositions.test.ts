import { describe, expect, it, vi } from "vitest";

// The module reads and writes through wagmi; what is under test here is pure.
vi.mock("@/config/wagmi", () => ({ config: {} }));
vi.mock("@wagmi/core", () => ({ estimateGas: vi.fn(), readContract: vi.fn(), sendTransaction: vi.fn() }));
vi.mock("@/lib/toastify", () => ({ noteSentBlock: vi.fn(), toastifyTx: vi.fn(), waitForSentBlock: vi.fn() }));
vi.mock("@/lib/on-chain/readContractsInBatch", () => ({ readContractsInBatch: vi.fn() }));

import { largestChunk, MAX_CHUNK_GAS, nextStep, toString31, wrapData } from "./strandedPositions";

describe("wrapData", () => {
  // "SER-INVALID": 11 bytes, left-aligned, 0x16 (11 × 2) in the last byte. The same encoding,
  // rebuilt from each token's symbol, mapped back to all 255 tokens of a stranded wallet through
  // the factory's `getWrapped1155` on Optimism (2026-11-03).
  const SER_INVALID = `0x5345522d494e56414c4944${"00".repeat(20)}16`;

  it("encodes a short string the way MarketFactory.toString31 does", () => {
    expect(toString31("SER-INVALID")).toBe(SER_INVALID);
  });

  it("is name, symbol and 18 decimals: 65 bytes", () => {
    const data = wrapData("SER-INVALID");
    expect(data).toBe(`${SER_INVALID}${SER_INVALID.slice(2)}12`);
    expect((data.length - 2) / 2).toBe(65);
  });

  it("refuses a name that does not fit", () => {
    expect(() => toString31("x".repeat(32))).toThrow();
    expect(() => toString31("x".repeat(31))).not.toThrow();
  });
});

describe("nextStep", () => {
  it("unwraps first, while any wrapped token is left", () => {
    expect(nextStep({ wrapped: [0n, 5n], raw: [3n, 0n], approved: true })).toBe("unwrap");
  });

  it("asks for the approval before moving raw positions", () => {
    expect(nextStep({ wrapped: [0n], raw: [3n], approved: false })).toBe("approve");
    expect(nextStep({ wrapped: [0n], raw: [3n], approved: true })).toBe("rewrap");
  });

  it("takes the approval back once nothing is left — even with nothing found at all", () => {
    expect(nextStep({ wrapped: [0n], raw: [0n], approved: true })).toBe("revoke");
    expect(nextStep({ wrapped: [], raw: [], approved: true })).toBe("revoke");
  });

  it("is done when the wallet holds nothing and the approval is gone", () => {
    expect(nextStep({ wrapped: [0n], raw: [0n], approved: false })).toBe("done");
    expect(nextStep({ wrapped: [], raw: [], approved: false })).toBe("done");
  });
});

describe("largestChunk", () => {
  const items = Array.from({ length: 255 }, (_, i) => ({
    token: `0x${i.toString(16).padStart(40, "0")}` as const,
    tokenId: BigInt(i),
    data: "0x" as const,
    amount: 1n,
  }));
  // ~53k a token, as measured for an unwrap.
  const perToken = (gas: bigint) => async (chunk: unknown[]) => BigInt(chunk.length) * gas;

  it("sends everything at once when it fits", async () => {
    expect(await largestChunk(items, perToken(53_000n))).toHaveLength(255);
  });

  it("halves until the transaction fits under the cap", async () => {
    const chunk = await largestChunk(items, perToken(100_000n));
    expect(chunk).toHaveLength(127);
    expect(BigInt(chunk.length) * 100_000n).toBeLessThanOrEqual(MAX_CHUNK_GAS);
  });

  it("treats a failed estimate as too big", async () => {
    const chunk = await largestChunk(items, async (c) => {
      if (c.length > 60) throw new Error("exceeds block gas limit");
      return 1n;
    });
    expect(chunk).toHaveLength(31);
  });

  it("gives up with the estimate's error when not even one fits", async () => {
    const failure = new Error("execution reverted");
    await expect(
      largestChunk(items, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});
