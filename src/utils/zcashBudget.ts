import { ZcashTableData } from "@/types";
import { DECIMALS, VOLUME_MIN } from "@/utils/constants";
import { NO_INDEX, YES_INDEX } from "@/utils/zcashMarkets";
import { formatUnits, parseUnits } from "viem";

export type ZcashSide = "YES" | "NO";

export const sideIndex = (side: ZcashSide) => (side === "YES" ? YES_INDEX : NO_INDEX);
export const otherSide = (side: ZcashSide): ZcashSide => (side === "YES" ? "NO" : "YES");

export const sideVolume = (row: ZcashTableData, side: ZcashSide) =>
  side === "YES" ? row.volumeUntilYesPrice : row.volumeUntilNoPrice;

export const sideBalance = (row: ZcashTableData, side: ZcashSide) =>
  Number(formatUnits((side === "YES" ? row.yesBalance : row.noBalance) ?? 0n, DECIMALS));

export const sidePrice = (row: ZcashTableData, side: ZcashSide) =>
  (side === "YES" ? row.yesPrice : row.noPrice) ?? 0;

export const sideDifference = (row: ZcashTableData, side: ZcashSide) =>
  side === "YES" ? row.yesDifference : row.noDifference;

/**
 * How the mint amount is divided across the Zcash markets.
 *
 * Kept apart from `lib/trade/getZcashQuote` deliberately: this is pure policy over plain numbers,
 * while that module reaches the network for every quote. Splitting them keeps the sizing rules
 * readable and testable on their own.
 */

/**
 * Smallest price gap worth trading on, in probability terms — half a percentage point.
 *
 * `VOLUME_MIN` alone is not enough to decide this. A yes/no call aims a pool at
 * `ZCASH_TARGET_PRICE`, so a market that has already run past the target still reports a sliver of
 * a difference: a YES pool at 0.9499 under an approve call is 1e-4 from target, which can still
 * size a leg that clears `VOLUME_MIN` and costs more in gas than the position is worth.
 *
 * The floor is what makes "the market already agrees with you" a real state rather than a rounding
 * artefact, and it keeps those rows out of the equal split so they do not shrink everyone else's
 * slice.
 */
export const ZCASH_MIN_EDGE = 0.005;

/** Whether the prediction disagrees with the market by enough to be worth acting on. */
export const hasZcashEdge = (row: ZcashTableData) =>
  Math.abs(row.yesDifference ?? 0) >= ZCASH_MIN_EDGE ||
  Math.abs(row.noDifference ?? 0) >= ZCASH_MIN_EDGE;

/**
 * A row can be funded only if the user gave it a prediction, that prediction disagrees with the
 * market by a meaningful amount, *and* there is enough depth to act on it.
 *
 * All three matter. The budget is split equally over these rows, so counting a row that already
 * matches the market would silently shrink everyone else's slice.
 */
export const isZcashRowFundable = (row: ZcashTableData) =>
  row.hasPrediction &&
  hasZcashEdge(row) &&
  (row.volumeUntilYesPrice >= VOLUME_MIN || row.volumeUntilNoPrice >= VOLUME_MIN);

/**
 * Divide the mint amount equally across the fundable rows.
 *
 * Equal-split by explicit choice, and deliberately restricted to markets the user expressed a view
 * on: uploading five predictions concentrates the whole budget on those five rather than spreading
 * it across all 37. Unlike Originality there is no parent market whose complete set gives every
 * child the full amount — these are 37 top-level markets collateralized in sUSDS, so a share spent
 * on one is a share not available to another.
 *
 * A row with no prediction still receives its own sell proceeds to recycle. That is its own money
 * rather than the user's mint, and it is what lets the arbitrage branch fire on a market the user
 * never had a view on.
 *
 * Any slice a row cannot use is simply not spent; it is not redistributed. That keeps the number
 * the user sees under "Per market" true for every market in the run.
 */
export const allocateZcashBudget = ({
  tableData,
  amount,
  proceedsByMarket,
}: {
  tableData: ZcashTableData[];
  amount: string;
  proceedsByMarket?: { [marketId: string]: bigint };
}): ZcashTableData[] => {
  const mintValue = amount && Number(amount) > 0 ? parseUnits(amount, DECIMALS) : 0n;
  const fundableCount = tableData.filter(isZcashRowFundable).length;
  const share = fundableCount > 0 ? mintValue / BigInt(fundableCount) : 0n;

  return tableData.map((row) => {
    const proceeds = proceedsByMarket?.[row.marketId] ?? 0n;
    const allocation = isZcashRowFundable(row) ? share : 0n;
    return { ...row, amount: formatUnits(allocation + proceeds, DECIMALS) };
  });
};

/** What one market's slice works out to, for the trade dialog's preflight stats. */
export const zcashShareOf = (amount: string, fundableCount: number) => {
  const mintValue = amount && Number(amount) > 0 ? parseUnits(amount, DECIMALS) : 0n;
  if (fundableCount <= 0 || mintValue <= 0n) return "0";
  return formatUnits(mintValue / BigInt(fundableCount), DECIMALS);
};

export interface PairedPlan {
  sellSide: ZcashSide;
  buySide: ZcashSide;
  /** Complete sets to mint before the sell leg can settle. */
  mintAmount: number;
  /** Outcome tokens to sell. */
  sellVolume: number;
  /** Ceiling on the buy leg before sell proceeds are known. */
  buyCeiling: number;
  /** How much of the full move this row can afford, in [0, 1]. */
  scale: number;
  /** Collateral available for the buy leg from the share alone, before proceeds. */
  cashAfterMint: number;
}

/**
 * Size the two legs of a paired trade. Pure: no quoting, so the arithmetic can be checked directly.
 *
 * With `S` the sell-leg volume in outcome tokens and `B` the buy-leg volume in collateral:
 *
 *     mintNeeded = max(0, S - balance(sellSide))
 *     netNeed    = mintNeeded + max(0, B - estimated sell proceeds)
 *     scale      = min(1, share / netNeed)
 *
 * The sell settles before the buy inside the same batch, so its proceeds genuinely fund part of the
 * buy and are netted off rather than reserved twice.
 *
 * `scale` applies to *both* legs. That is the point of the paired model: an underfunded row makes a
 * smaller move on both pools rather than completing one side and starving the other, which would
 * leave YES+NO away from 1 — the very arbitrage this branch exists to avoid opening.
 */
export const planPairedLegs = (row: ZcashTableData): PairedPlan | null => {
  const { yesDifference, noDifference } = row;
  if (yesDifference == null || noDifference == null) return null;

  const sellSide: ZcashSide = yesDifference < 0 ? "YES" : "NO";
  const buySide = otherSide(sellSide);

  // No meaningful disagreement with the market — see `ZCASH_MIN_EDGE`.
  if (!hasZcashEdge(row)) return null;

  const sellVolume = sideVolume(row, sellSide);
  const buyVolume = sideVolume(row, buySide);
  // A side sitting exactly at target has nothing to do; the other may still be actionable, which is
  // why this checks both volumes rather than bailing on the pair.
  if (sellVolume < VOLUME_MIN && buyVolume < VOLUME_MIN) return null;

  const share = Number(row.amount ?? "0");
  const sellBalance = sideBalance(row, sellSide);
  const mintNeeded = Math.max(0, sellVolume - sellBalance);
  const estimatedProceeds = sellVolume * sidePrice(row, sellSide);
  const netNeed = mintNeeded + Math.max(0, buyVolume - estimatedProceeds);

  const scale = netNeed > 0 ? Math.min(1, share / netNeed) : 1;
  if (scale <= 0) return null;

  const mintAmount = mintNeeded * scale;

  return {
    sellSide,
    buySide,
    mintAmount,
    sellVolume: Math.min(sellVolume * scale, sellBalance + mintAmount),
    buyCeiling: buyVolume * scale,
    scale,
    cashAfterMint: Math.max(0, share - mintAmount),
  };
};
