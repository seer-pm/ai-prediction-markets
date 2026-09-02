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
 * `VOLUME_MIN` alone is not enough to decide this. A prediction lands on a pool that is already
 * close to it far more often than not — a YES pool at 0.8195 under a 0.82 call is 5e-4 from
 * target, which can still size a leg that clears `VOLUME_MIN` and costs more in gas than the
 * position is worth.
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
 * A row can be funded only if the user gave it a number, that number disagrees with the market by
 * a meaningful amount, *and* there is enough depth to act on it.
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
 * on: uploading five numbers concentrates the whole budget on those five rather than spreading
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
  kind: "paired";
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

export interface DualBuyPlan {
  kind: "dual-buy";
  /** Collateral to spend on each side. */
  yesVolume: number;
  noVolume: number;
  /** How much of the full move this row can afford, in [0, 1]. */
  scale: number;
}

export interface DualSellPlan {
  kind: "dual-sell";
  /** Outcome tokens to sell on each side. */
  yesVolume: number;
  noVolume: number;
  /** Complete sets to mint before the sell legs can settle. */
  mintAmount: number;
}

export type ZcashPlan = PairedPlan | DualBuyPlan | DualSellPlan;

/**
 * Both pools sit below the number: YES+NO is under 1, so every dollar of the two sides together
 * buys more than a dollar of eventual payout. Buy both from cash — there is nothing to mint,
 * because minting a complete set costs exactly 1 and the pair costs less.
 *
 * The two legs are scaled by the same factor rather than filled in order, for the same reason the
 * paired branch does it: a row that can only afford half the move should make half of *both*
 * moves and leave the sum where it found it, not complete one side and drag YES+NO further off 1.
 */
const planDualBuy = (share: number, volYes: number, volNo: number): DualBuyPlan | null => {
  const netNeed = volYes + volNo;
  if (netNeed <= 0) return null;

  // Both legs are collateral in, so the shared scale is what keeps their sum inside the share.
  const scale = Math.min(1, share / netNeed);
  if (scale <= 0) return null;

  return { kind: "dual-buy", yesVolume: volYes * scale, noVolume: volNo * scale, scale };
};

/**
 * Both pools sit above the number: YES+NO is over 1 — but by less than `ARB_SUM_THRESHOLD`, or the
 * prediction-free arbitrage would have taken this row already. Sell both down toward the number.
 *
 * Selling needs outcome tokens, so balance is spent first and only the *symmetric* remainder is
 * minted: a complete set yields one of each, so minting past the shorter side's headroom would
 * leave tokens that cannot be sold without pushing that pool past its target.
 */
const planDualSell = (
  row: ZcashTableData,
  share: number,
  volYes: number,
  volNo: number,
): DualSellPlan | null => {
  const yesBalance = sideBalance(row, "YES");
  const noBalance = sideBalance(row, "NO");

  const mintAmount = Math.max(0, Math.min(volYes - yesBalance, volNo - noBalance, share));

  const yesVolume = Math.min(volYes, yesBalance + mintAmount);
  const noVolume = Math.min(volNo, noBalance + mintAmount);
  if (yesVolume <= 0 && noVolume <= 0) return null;

  return { kind: "dual-sell", yesVolume, noVolume, mintAmount };
};

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
const planPaired = (row: ZcashTableData, share: number): PairedPlan | null => {
  const sellSide: ZcashSide = (row.yesDifference ?? 0) < 0 ? "YES" : "NO";
  const buySide = otherSide(sellSide);

  const sellVolume = sideVolume(row, sellSide);
  const buyVolume = sideVolume(row, buySide);

  const sellBalance = sideBalance(row, sellSide);
  const mintNeeded = Math.max(0, sellVolume - sellBalance);
  const estimatedProceeds = sellVolume * sidePrice(row, sellSide);
  const netNeed = mintNeeded + Math.max(0, buyVolume - estimatedProceeds);

  const scale = netNeed > 0 ? Math.min(1, share / netNeed) : 1;
  if (scale <= 0) return null;

  const mintAmount = mintNeeded * scale;

  return {
    kind: "paired",
    sellSide,
    buySide,
    mintAmount,
    sellVolume: Math.min(sellVolume * scale, sellBalance + mintAmount),
    buyCeiling: buyVolume * scale,
    scale,
    cashAfterMint: Math.max(0, share - mintAmount),
  };
};

/**
 * Pick the shape of this row's move, then size it.
 *
 * A probability can land on either side of either pool, so unlike a yes/no call the two differences
 * can share a sign. `yesDifference + noDifference = 1 - (yesPrice + noPrice)`, so the sign pair is
 * really a statement about where YES+NO sits:
 *
 * - one of each sign → the pools straddle the number: sell the rich side, buy the cheap one;
 * - neither negative → YES+NO is under 1, both sides are cheap: buy both;
 * - neither positive → YES+NO is over 1, both sides are rich: sell both.
 *
 * Zero is deliberately "nothing to do on that side" rather than a direction: a side sitting exactly
 * on its target has a volume of 0 and drops out of whichever plan it lands in, instead of pulling
 * the row into a branch that would trade it the wrong way.
 */
export const planZcashLegs = (row: ZcashTableData): ZcashPlan | null => {
  const { yesDifference, noDifference } = row;
  if (yesDifference == null || noDifference == null) return null;

  // No meaningful disagreement with the market — see `ZCASH_MIN_EDGE`.
  if (!hasZcashEdge(row)) return null;

  const volYes = row.volumeUntilYesPrice;
  const volNo = row.volumeUntilNoPrice;
  // A side sitting exactly at target has nothing to do; the other may still be actionable, which is
  // why this checks both volumes rather than bailing on the pair.
  if (volYes < VOLUME_MIN && volNo < VOLUME_MIN) return null;

  const share = Number(row.amount ?? "0");

  if (yesDifference >= 0 && noDifference >= 0) return planDualBuy(share, volYes, volNo);
  if (yesDifference <= 0 && noDifference <= 0) return planDualSell(row, share, volYes, volNo);
  return planPaired(row, share);
};
