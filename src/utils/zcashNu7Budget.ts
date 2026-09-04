import { ZcashNu7OutcomeRow, ZcashNu7TableData } from "@/types";
import { DECIMALS, VOLUME_MIN } from "@/utils/constants";
import { formatUnits, parseUnits } from "viem";

/**
 * How the mint amount is divided across the NU7 ballot questions, and how one question's legs are
 * sized. Pure policy over plain numbers, kept apart from `lib/trade/getZcashNu7Quote` for the same
 * reason `zcashBudget` is kept apart from `getZcashQuote`: that module reaches the network for every
 * quote, and splitting them keeps the arithmetic readable and checkable on its own.
 *
 * **The binary contest's three-branch taxonomy does not carry over.** `planPaired` / `planDualBuy` /
 * `planDualSell` exist only because two pools price the *same* question, so YES+NO has to be held
 * near 1 and those branches are really a statement about where that sum sits. Here every outcome has
 * its own pool and the targets are absolute and independent by construction, so there is one shape:
 * a set of sell legs and a set of buy legs. This planner is simpler than the binary one, not harder.
 */

/**
 * Smallest price gap worth trading on, in probability terms — half a percentage point.
 *
 * Deliberately the same number as `ZCASH_MIN_EDGE`, and deliberately duplicated rather than imported
 * so the two contests are not coupled. Note that a 3-4-way market prices its outcomes around 0.25
 * rather than 0.5, so half a point is a *relatively* larger edge here — but this floor is a
 * gas-economics number, not a statistical one, and the gas cost of a leg is identical either way.
 */
export const ZCASH_NU7_MIN_EDGE = 0.005;

/** Whether this leg's prediction disagrees with its pool by enough to be worth acting on. */
export const hasNu7Edge = (leg: ZcashNu7OutcomeRow) =>
  leg.hasPrediction && Math.abs(leg.difference ?? 0) >= ZCASH_NU7_MIN_EDGE;

/** Edge, a pool to trade against, and enough depth to make a transaction worth its gas. */
export const isNu7LegActionable = (leg: ZcashNu7OutcomeRow) =>
  hasNu7Edge(leg) && leg.price !== null && leg.volumeUntilPrice >= VOLUME_MIN;

/** A question is fundable when at least one of its outcomes is worth trading. */
export const isZcashNu7RowFundable = (row: ZcashNu7TableData) =>
  row.outcomes.some(isNu7LegActionable);

/**
 * Divide the mint amount equally across the fundable questions.
 *
 * The unit is the **market, not the outcome**, for three reasons. Complete sets exist per market, so
 * sizing the mint needs one pot per market — a per-outcome budget would have to be re-pooled across
 * a question's sell legs before the mint could be sized at all, which is the market bucket with an
 * extra step. A four-outcome question annotated in full is not four times the edge of a one-outcome
 * one; it is the same ballot question either way. And it keeps the dialog's "per question" stat
 * honest.
 *
 * Any slice a question cannot use is simply not spent; it is not redistributed. That keeps the
 * number the user sees under "Per question" true for every question in the run.
 */
export const allocateZcashNu7Budget = ({
  tableData,
  amount,
}: {
  tableData: ZcashNu7TableData[];
  amount: string;
}): ZcashNu7TableData[] => {
  const mintValue = amount && Number(amount) > 0 ? parseUnits(amount, DECIMALS) : 0n;
  const fundableCount = tableData.filter(isZcashNu7RowFundable).length;
  const share = fundableCount > 0 ? mintValue / BigInt(fundableCount) : 0n;

  return tableData.map((row) => ({
    ...row,
    amount: formatUnits(isZcashNu7RowFundable(row) ? share : 0n, DECIMALS),
  }));
};

/** What one question's slice works out to, for the trade dialog's preflight stats. */
export const zcashNu7ShareOf = (amount: string, fundableCount: number) => {
  const mintValue = amount && Number(amount) > 0 ? parseUnits(amount, DECIMALS) : 0n;
  if (fundableCount <= 0 || mintValue <= 0n) return "0";
  return formatUnits(mintValue / BigInt(fundableCount), DECIMALS);
};

export interface ZcashNu7Leg {
  outcomeIndex: number;
  /** Swap input: outcome tokens for a sell, collateral for a buy. */
  volume: number;
}

export interface ZcashNu7Plan {
  /** Complete sets to mint before the sell legs can settle. */
  mintAmount: number;
  sells: ZcashNu7Leg[];
  /** Pre-scale collateral ceilings. The quote layer applies the final scale. */
  buys: ZcashNu7Leg[];
  /** Collateral left from the slice once the sets are paid for. */
  cashAfterMint: number;
  /** First-order sell proceeds. The quote layer replaces this with the real quoted output. */
  estProceeds: number;
  /** Sum of the buy ceilings — the denominator of the buy scale. */
  buyTotal: number;
}

/**
 * Size one question's legs. Pure: no quoting, so the arithmetic can be checked directly.
 *
 * Over the market's substantive outcomes only — Invalid has no pool, no price and no target:
 *
 *     p_i  market price of outcome i        b_i  outcome tokens already held
 *     t_i  the user's absolute target        d_i  = t_i - p_i
 *     v_i  swap input to move pool i to t_i — collateral when d_i > 0, tokens when d_i < 0
 *
 *     S = { i : d_i <= -EDGE, v_i >= VOLUME_MIN }    sell legs
 *     B = { i : d_i >= +EDGE, v_i >= VOLUME_MIN }    buy legs
 *
 * An outcome with no target is in neither set and is never traded. That is the point of the format:
 * each outcome has its own pool, so a view on outcome 2 is executable on its own.
 *
 * 1. THE MINT. Selling outcome i beyond b_i needs tokens only a complete set can produce, and one
 *    set yields one of EVERY outcome. So m sets serve every sell leg at once, and the binding leg is
 *    the HUNGRIEST:
 *
 *        need_i = max(0, v_i - b_i)                     for i in S
 *        m      = min(share, max { need_i : i in S })    (0 when S is empty)
 *
 *    `max`, not `min`. This is the faithful generalization of `planPaired`, whose single sell leg
 *    mints exactly its own need; `planDualSell`'s min-over-legs belongs to the *arbitrage* branch,
 *    which exists to hold a sum at 1 — a constraint this contest does not have. Taking the min here
 *    would mean needs of {5, 200} mint 5 sets and barely move either pool.
 *
 *    `share` is the hard bound: `splitPosition` executes before this market's sells settle, so the
 *    collateral has to be on hand at that instant. There is no second, solvency bound to apply — a
 *    set costs exactly 1 sUSDS and `share` is denominated in the same unit, so "can the sells repay
 *    the mint" is never tighter than "can we afford it".
 *
 * 2. THE SELLS. Each spends what it holds plus what the mint delivered, capped at the target:
 *
 *        sell_i = min(v_i, b_i + m)                     for i in S
 *
 *    The cap is what makes over-minting safe: surplus sets never push a pool past the user's own
 *    number, they simply stay in the wallet as inventory. Not scaled down to match a short buy side,
 *    unlike `planPaired` — that coupling exists to hold YES+NO at 1 and has no analogue here.
 *
 * 3. THE BUYS. The full distance to the target, NOT reduced by the tokens the mint handed over:
 *
 *        ceiling_i = v_i                                for i in B
 *
 *    A target here is a POOL PRICE target — `getVolumeUntilPrice` returns "the swap INPUT amount
 *    needed to move the pool to targetPrice" — and minted tokens do not move a pool. Crediting them
 *    against the buy would leave the pool short of the number the user asked for, which is the one
 *    thing the run exists to deliver. `planPaired` sets the precedent: it mints for its sell leg,
 *    receives buy-side tokens too, and still buys the full `buyVolume`.
 *
 * 4. THE BUDGET. What is left of the slice after minting, plus the sells' proceeds — the sells
 *    settle before the buys inside the same batch, so those proceeds genuinely fund part of the buy
 *    rather than being reserved twice:
 *
 *        cashAfterMint = max(0, share - m)
 *        estProceeds   = sum { sell_i * p_i : i in S }
 *        buyTotal      = sum { ceiling_i    : i in B }
 *        buyScale      = buyTotal > 0 ? min(1, (cashAfterMint + estProceeds) / buyTotal) : 1
 *        buy_i         = ceiling_i * buyScale
 *
 *    One scale across all buy legs rather than filling them in order: an underfunded question should
 *    move every pool it has a view on part of the way, not complete outcome 1 and leave outcome 3
 *    untouched.
 *
 * `estProceeds` is first-order. `getZcashNu7MarketQuotes` recomputes the scale from the sells' real
 * quoted output before pricing the buys — the same division of labour as `planPaired` and
 * `pairedZcashQuotes`.
 *
 * WORKED EXAMPLE, which the implementation is checked against. Q1, four substantive outcomes priced
 * [0.50, 0.25, 0.15, 0.10]. The user predicts outcome 1 -> 0.35 and outcome 2 -> 0.40, with no view
 * on 3 or 4 (their targets sum to 0.75, which is fine — nothing here is normalised). Balances are
 * zero, v_1 = 60 tokens, v_2 = 45 sUSDS, share = 40.
 *
 *     S = {1}, B = {2}
 *     need_1 = 60                      m = min(40, 60) = 40
 *     sell_1 = min(60, 0 + 40) = 40 tokens
 *     ceiling_2 = 45
 *     cashAfterMint = max(0, 40 - 40) = 0
 *     estProceeds   = 40 * 0.50 = 20
 *     buyScale      = min(1, (0 + 20) / 45) = 0.444
 *     buy_2         = 20 sUSDS
 *
 * 40 sUSDS out to mint, ~20 back from selling outcome 1, 20 spent buying outcome 2 — and the wallet
 * keeps 40 tokens each of outcomes 2, 3, 4 and Invalid, worth about 40 * (1 - 0.50) = 20 sUSDS,
 * exactly the mint cost minus the sell proceeds. The arithmetic closes.
 *
 * That leftover inventory is inherent to shorting through complete sets, not a defect, and it has
 * precedent — `getZcashQuote` documents the same for the Invalid token it mints and never sells:
 * "It is left in the wallet deliberately." **Sell all positions** clears it in one click.
 *
 * Returns null when nothing is actionable.
 */
export const planZcashNu7Legs = (row: ZcashNu7TableData): ZcashNu7Plan | null => {
  const actionable = row.outcomes.filter(isNu7LegActionable);
  if (!actionable.length) return null;

  const share = Number(row.amount ?? "0");

  const sellLegs = actionable.filter((leg) => (leg.difference ?? 0) < 0);
  const buyLegs = actionable.filter((leg) => (leg.difference ?? 0) > 0);

  const balanceOf = (leg: ZcashNu7OutcomeRow) => Number(formatUnits(leg.balance ?? 0n, DECIMALS));

  // 1. The mint: the hungriest sell leg, bounded by what this question can afford.
  const maxNeed = sellLegs.reduce(
    (need, leg) => Math.max(need, Math.max(0, leg.volumeUntilPrice - balanceOf(leg))),
    0,
  );
  const mintAmount = Math.min(share, maxNeed);

  // 2. The sells: balance plus the mint, never past the target.
  const sells = sellLegs
    .map((leg) => ({
      outcomeIndex: leg.outcomeIndex,
      volume: Math.min(leg.volumeUntilPrice, balanceOf(leg) + mintAmount),
    }))
    .filter((leg) => leg.volume >= VOLUME_MIN);

  // 3. The buys: the full distance to the target, uncredited.
  const buys = buyLegs.map((leg) => ({
    outcomeIndex: leg.outcomeIndex,
    volume: leg.volumeUntilPrice,
  }));

  if (!sells.length && !buys.length) return null;

  // 4. The budget.
  const priceByIndex = new Map(row.outcomes.map((leg) => [leg.outcomeIndex, leg.price ?? 0]));
  const estProceeds = sells.reduce(
    (sum, leg) => sum + leg.volume * (priceByIndex.get(leg.outcomeIndex) ?? 0),
    0,
  );

  return {
    mintAmount,
    sells,
    buys,
    cashAfterMint: Math.max(0, share - mintAmount),
    estProceeds,
    buyTotal: buys.reduce((sum, leg) => sum + leg.volume, 0),
  };
};

/** The shared factor every buy leg is scaled by, given the collateral actually available. */
export const nu7BuyScale = (buyTotal: number, available: number) =>
  buyTotal > 0 ? Math.min(1, available / buyTotal) : 1;
