import { describe, expect, it } from "vitest";
import { OriginalityTableData, ZcashTableData } from "@/types";
import { planCompleteSetMerges, planZcashSetMerges } from "./completeSets";

const row = (id: string, tokens = 3): OriginalityTableData =>
  ({
    repo: id,
    marketId: `0x${id}`,
    collateralToken: "0xc0",
    wrappedTokens: ["down", "up", "invalid"].slice(0, tokens).map((side) => `0x${id}${side}`),
    upBalance: 999n,
    downBalance: 999n,
  }) as unknown as OriginalityTableData;

describe("planCompleteSetMerges", () => {
  it("merges the smallest of DOWN, UP and Invalid and leaves the rest to sell", () => {
    // DOWN 10, UP 7, Invalid 8
    const { merges, rows } = planCompleteSetMerges([row("a")], [10n, 7n, 8n]);
    expect(merges).toEqual([{ marketId: "0xa", tokens: ["0xadown", "0xaup", "0xainvalid"], amount: 7n }]);
    expect(rows[0].downBalance).toBe(3n);
    expect(rows[0].upBalance).toBe(0n);
  });

  it("merges nothing without the Invalid leg, and sells both sides as held", () => {
    const { merges, rows } = planCompleteSetMerges([row("a")], [10n, 7n, 0n]);
    expect(merges).toEqual([]);
    expect(rows[0].downBalance).toBe(10n);
    expect(rows[0].upBalance).toBe(7n);
  });

  it("reads each row's balances from its own slice", () => {
    const { merges, rows } = planCompleteSetMerges([row("a"), row("b")], [0n, 5n, 5n, 4n, 4n, 9n]);
    expect(merges).toEqual([{ marketId: "0xb", tokens: ["0xbdown", "0xbup", "0xbinvalid"], amount: 4n }]);
    expect([rows[0].downBalance, rows[0].upBalance]).toEqual([0n, 5n]);
    expect([rows[1].downBalance, rows[1].upBalance]).toEqual([0n, 0n]);
  });

  it("takes the fresh balances over the ones the rows arrived with", () => {
    const { rows } = planCompleteSetMerges([row("a")], [0n, 0n, 0n]);
    expect([rows[0].downBalance, rows[0].upBalance]).toEqual([0n, 0n]);
  });

  it("does not merge a market with no Invalid token, and keeps the next row aligned", () => {
    const { merges, rows } = planCompleteSetMerges([row("a", 2), row("b")], [6n, 6n, 2n, 3n, 4n]);
    expect(merges).toEqual([{ marketId: "0xb", tokens: ["0xbdown", "0xbup", "0xbinvalid"], amount: 2n }]);
    expect([rows[0].downBalance, rows[0].upBalance]).toEqual([6n, 6n]);
    expect([rows[1].downBalance, rows[1].upBalance]).toEqual([0n, 1n]);
  });

  it("treats balances that never arrived as nothing held", () => {
    const { merges, rows } = planCompleteSetMerges([row("a")], []);
    expect(merges).toEqual([]);
    expect([rows[0].downBalance, rows[0].upBalance]).toEqual([0n, 0n]);
  });
});

const zcashRow = (id: string): ZcashTableData =>
  ({
    project: id,
    marketId: `0x${id}`,
    collateralToken: "0xc0",
    wrappedTokens: ["yes", "no", "invalid"].map((side) => `0x${id}${side}`),
    yesBalance: 999n,
    noBalance: 999n,
  }) as unknown as ZcashTableData;

describe("planZcashSetMerges", () => {
  it("merges the smallest of YES, NO and Invalid and leaves the rest to sell", () => {
    // YES 10, NO 7, Invalid 8 — the reverse of a repo market's DOWN-first order.
    const { merges, rows } = planZcashSetMerges([zcashRow("a")], [10n, 7n, 8n]);
    expect(merges).toEqual([{ marketId: "0xa", tokens: ["0xayes", "0xano", "0xainvalid"], amount: 7n }]);
    expect(rows[0].yesBalance).toBe(3n);
    expect(rows[0].noBalance).toBe(0n);
  });

  it("merges nothing for tokens bought without their Invalid leg", () => {
    const { merges, rows } = planZcashSetMerges([zcashRow("a")], [10n, 7n, 0n]);
    expect(merges).toEqual([]);
    expect([rows[0].yesBalance, rows[0].noBalance]).toEqual([10n, 7n]);
  });

  it("reads each market's balances from its own slice", () => {
    const { merges, rows } = planZcashSetMerges(
      [zcashRow("a"), zcashRow("b")],
      [0n, 5n, 5n, 4n, 6n, 9n],
    );
    expect(merges).toEqual([{ marketId: "0xb", tokens: ["0xbyes", "0xbno", "0xbinvalid"], amount: 4n }]);
    expect([rows[0].yesBalance, rows[0].noBalance]).toEqual([0n, 5n]);
    expect([rows[1].yesBalance, rows[1].noBalance]).toEqual([0n, 2n]);
  });
});
