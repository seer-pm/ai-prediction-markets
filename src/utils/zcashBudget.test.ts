import { describe, expect, it } from "vitest";
import type { ZcashTableData } from "@/types";
import { VOLUME_MIN } from "./constants";
import { noTradeError } from "./errors";
import { allocateZcashBudget, getZcashMinMint, planZcashLegs, zcashMinShare } from "./zcashBudget";

/**
 * A Round 2 market as the test CSV left it: the prediction 0.10 above the pool, so YES is bought
 * and NO sold. Volumes are what `getVolumeUntilPrice` read off the live ZEBRADOS62 pools
 * (~182 sUSDS each), rounded.
 */
const pairedRow = (over: Partial<ZcashTableData> = {}): ZcashTableData => ({
  project: "p",
  applicant: "",
  requestedUsd: 0,
  tier: "",
  yesPrice: 0.52,
  noPrice: 0.48,
  predictedProbability: 0.62,
  yesDifference: 0.1,
  noDifference: -0.1,
  marketId: "0x1",
  hasPrediction: true,
  volumeUntilYesPrice: 13,
  volumeUntilNoPrice: 25,
  volumeUntilYesEqual: 0,
  volumeUntilNoEqual: 0,
  yesBalance: 0n,
  noBalance: 0n,
  wrappedTokens: [],
  collateralToken: "0x0000000000000000000000000000000000000000",
  ...over,
});

/** Does the row put a leg in front of the quoter at the slice `allocateZcashBudget` gave it? */
const trades = (row: ZcashTableData) => {
  const plan = planZcashLegs(row);
  if (!plan || plan.kind !== "paired") return false;
  const proceeds = plan.sellVolume * (plan.sellSide === "YES" ? row.yesPrice! : row.noPrice!);
  return (
    plan.sellVolume >= VOLUME_MIN ||
    Math.min(plan.buyCeiling, plan.cashAfterMint + proceeds) >= VOLUME_MIN
  );
};

describe("Zcash minimum mint", () => {
  it("is the share at which the row first trades", () => {
    const row = pairedRow();
    const share = zcashMinShare(row)!;
    expect(share).toBeGreaterThan(VOLUME_MIN);
    expect(trades({ ...row, amount: (share * 1.001).toFixed(18) })).toBe(true);
    expect(trades({ ...row, amount: (share * 0.999).toFixed(18) })).toBe(false);
  });

  it("across 55 markets, refuses the 0.5 sUSDS that found nothing and covers every market", () => {
    const rows = Array.from({ length: 55 }, (_, i) => pairedRow({ marketId: `0x${i}` }));
    const min = getZcashMinMint(rows)!;
    expect(min).toBeGreaterThan(0.5);

    const atHalf = allocateZcashBudget({ tableData: rows, amount: "0.5" });
    expect(atHalf.filter(trades)).toHaveLength(0);

    const atMin = allocateZcashBudget({ tableData: rows, amount: String(min) });
    expect(atMin.filter(trades)).toHaveLength(55);
  });

  it("is the largest market's need times the market count", () => {
    const thin = pairedRow({ marketId: "0xa", volumeUntilYesPrice: 2, volumeUntilNoPrice: 30 });
    const rows = [pairedRow(), thin];
    const need = Math.max(zcashMinShare(rows[0])!, zcashMinShare(thin)!);
    expect(getZcashMinMint(rows)).toBe(Math.ceil(need * 2 * 100) / 100);
  });

  it("needs nothing minted when the tokens to sell are already held", () => {
    const row = pairedRow({ noBalance: 10n ** 18n });
    expect(zcashMinShare(row)).toBe(0);
    expect(getZcashMinMint([row])).toBe(0.01);
  });

  it("has no minimum when nothing can trade", () => {
    const flat = pairedRow({ volumeUntilYesPrice: 0.001, volumeUntilNoPrice: 0.001 });
    expect(getZcashMinMint([flat])).toBeUndefined();
    const noView = pairedRow({ hasPrediction: false });
    expect(getZcashMinMint([noView])).toBeUndefined();
  });
});

describe("noTradeError", () => {
  it("says an amount under the minimum is not enough, and names the minimum", () => {
    const error = noTradeError({ amount: "0.5", minAmount: 0.81, minShare: 0.01, symbol: "sUSDS" });
    expect(error.message).toBe("0.5 sUSDS is not enough to trade.");
    expect(error.recovery).toContain("Enter at least 0.81 sUSDS");
  });

  it("does not blame the amount when it cleared the minimum", () => {
    const error = noTradeError({ amount: "5", minAmount: 0.81, minShare: 0.01, symbol: "sUSDS" });
    expect(error.message).toBe("None of your markets got a quote.");
    expect(error.recovery).toMatch(/quotes failed or the pools have no liquidity/);
  });

  it("without a minimum, names both causes", () => {
    const error = noTradeError({ amount: "0.2", minShare: 0.01, symbol: "sUSDS" });
    expect(error.message).toBe("None of your markets got a quote.");
    expect(error.recovery).toMatch(/may not be enough/);
  });

  it("with no amount, does not mention one", () => {
    const error = noTradeError({ amount: "", minShare: 0.01, symbol: "sUSDS" });
    expect(error.recovery).not.toMatch(/amount/);
  });
});
