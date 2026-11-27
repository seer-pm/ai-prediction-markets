import { UniswapQuoteTradeResult, ZcashQuoteResult, ZcashTableData } from "@/types";
import { CHAIN_ID, DECIMALS, VOLUME_MIN } from "@/utils/constants";
import type { DualBuyPlan, DualSellPlan, PairedPlan } from "@/utils/zcashBudget";
import {
  hasZcashEdge,
  planZcashLegs,
  sideBalance,
  sideDifference,
  sideIndex,
  sideVolume,
  type ZcashSide,
} from "@/utils/zcashBudget";
import { Address, formatUnits } from "viem";
import { getUniswapQuote } from "./getQuote";
import { QUOTE_ATTEMPTS, settleWithRetry, type QuoteFailure } from "./settleWithRetry";

/**
 * Trade planning for the Zcash Q3 2026 set: 37 independent binary markets.
 *
 * Two things make this different from every other contest's quote builder:
 *
 * 1. **Two-leg trades, always.** Each market has two pools (YES/sUSDS and NO/sUSDS) that price the
 *    same question. Moving only one of them leaves YES+NO away from 1 — an arbitrage handed to
 *    whoever notices first. So every branch moves *both* pools toward the user's number: sell a
 *    side trading above it, buy a side trading below it, and mint complete sets when a sell needs
 *    tokens that are not already held. Which of the three shapes a row takes is decided by
 *    `planZcashLegs`. When the budget cannot fund the full move, both legs are scaled by the same
 *    factor so a partial move still lands near a sum of 1.
 *
 * 2. **No parent market.** These are top-level markets collateralized in sUSDS, so minting a
 *    complete set in one market does nothing for the other 36. The mint budget is divided across
 *    rows by the caller and arrives as `row.amount`; nothing here may assume it is replicated.
 *
 * Minting also yields an Invalid token that is never sold — Invalid has no pool. On this market set
 * that is not dead weight: a proposal withdrawn before the ballot freezes resolves Invalid, so the
 * token carries real probability. It is left in the wallet deliberately.
 */

type TradeAction = "buy" | "sell";

/** How many times a market is priced before it is reported as skipped. */
export const ZCASH_QUOTE_ATTEMPTS = QUOTE_ATTEMPTS;

/** A market the run could not price, after every attempt. */
export type ZcashQuoteFailure = QuoteFailure<ZcashTableData>;

/** Uniswap quotes take a decimal string; 15 places is well inside an 18-decimal token. */
const toAmount = (value: number) => value.toFixed(15);

/**
 * One leg. `volume` is the swap input: collateral for a buy, outcome tokens for a sell.
 * Returns null for a leg too small to be worth a transaction. A quote that fails throws: the whole
 * market is then retried, and reported if it still fails, rather than trading one leg of two.
 */
const quoteLeg = async ({
  account,
  row,
  side,
  action,
  volume,
}: {
  account: Address;
  row: ZcashTableData;
  side: ZcashSide;
  action: TradeAction;
  volume: number;
}): Promise<UniswapQuoteTradeResult | null> => {
  if (!(volume >= VOLUME_MIN)) return null;

  const token = row.wrappedTokens[sideIndex(side)];
  if (!token) return null;

  return getUniswapQuote(
    CHAIN_ID,
    account,
    toAmount(volume),
    { address: token, symbol: side, decimals: DECIMALS },
    { address: row.collateralToken, symbol: row.project, decimals: DECIMALS },
    action,
  );
};

/**
 * YES+NO>1 arbitrage: mint a complete set and sell both sides until each pool reaches its
 * proportional share of 1. Ignores the user's prediction, so it runs on rows with no prediction
 * too — but such a row is given no slice of the mint budget, leaving it to trade from balance.
 */
const arbSellZcashQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: ZcashTableData;
}): Promise<ZcashQuoteResult | null> => {
  const volYes = row.volumeUntilYesEqual;
  const volNo = row.volumeUntilNoEqual;

  // No headroom on either side to push the sum back toward 1.
  if (volYes < VOLUME_MIN && volNo < VOLUME_MIN) return null;

  const yesBal = sideBalance(row, "YES");
  const noBal = sideBalance(row, "NO");
  const cap = Number(row.amount ?? "0");

  // Mint only the symmetric headroom left after selling tokens already owned.
  const mintAmount = Math.max(0, Math.min(volYes - yesBal, volNo - noBal, cap));

  // Each side sells owned + minted tokens, capped so we never overshoot sum<1.
  const sellYes = Math.min(volYes, yesBal + mintAmount);
  const sellNo = Math.min(volNo, noBal + mintAmount);

  const [yesQuote, noQuote] = await Promise.all([
    quoteLeg({ account, row, side: "YES", action: "sell", volume: sellYes }),
    quoteLeg({ account, row, side: "NO", action: "sell", volume: sellNo }),
  ]);

  const quotes = [yesQuote, noQuote].filter(Boolean) as UniswapQuoteTradeResult[];
  if (!quotes.length) return null;

  return {
    quoteType: "arb-sell",
    quotes,
    row,
    mintAmount: toAmount(mintAmount),
  };
};

/**
 * The pools straddle the user's number: one side is cheap, the other is rich. Move both. Sizing
 * lives in `planPaired` (`utils/zcashBudget`); this only turns the plan into quotes.
 */
const pairedZcashQuotes = async ({
  account,
  row,
  plan,
}: {
  account: Address;
  row: ZcashTableData;
  plan: PairedPlan;
}): Promise<ZcashQuoteResult | null> => {
  const sellQuote = await quoteLeg({
    account,
    row,
    side: plan.sellSide,
    action: "sell",
    volume: plan.sellVolume,
  });

  // Proceeds are known now; whatever the share has left after minting tops them up.
  const proceeds = sellQuote ? Number(formatUnits(sellQuote.value, DECIMALS)) : 0;
  const buyQuote = await quoteLeg({
    account,
    row,
    side: plan.buySide,
    action: "buy",
    volume: Math.min(plan.buyCeiling, plan.cashAfterMint + proceeds),
  });

  const quotes = [sellQuote, buyQuote].filter(Boolean) as UniswapQuoteTradeResult[];
  if (!quotes.length) return null;

  return {
    quoteType: "paired",
    quotes,
    row,
    mintAmount: toAmount(plan.mintAmount),
  };
};

/**
 * Both pools trade below the user's number, so both sides are cheap: buy each with cash. No mint —
 * a complete set costs exactly 1, and the pair together costs less than that, which is the whole
 * reason this shape exists.
 */
const dualBuyZcashQuotes = async ({
  account,
  row,
  plan,
}: {
  account: Address;
  row: ZcashTableData;
  plan: DualBuyPlan;
}): Promise<ZcashQuoteResult | null> => {
  const [yesQuote, noQuote] = await Promise.all([
    quoteLeg({ account, row, side: "YES", action: "buy", volume: plan.yesVolume }),
    quoteLeg({ account, row, side: "NO", action: "buy", volume: plan.noVolume }),
  ]);

  const quotes = [yesQuote, noQuote].filter(Boolean) as UniswapQuoteTradeResult[];
  if (!quotes.length) return null;

  return { quoteType: "dual-buy", quotes, row };
};

/**
 * Both pools trade above the user's number, so both sides are rich: sell each down toward it.
 * `planDualSell` has already decided how much of that comes from balance and how much has to be
 * minted, so this only turns the plan into quotes.
 */
const dualSellZcashQuotes = async ({
  account,
  row,
  plan,
}: {
  account: Address;
  row: ZcashTableData;
  plan: DualSellPlan;
}): Promise<ZcashQuoteResult | null> => {
  const [yesQuote, noQuote] = await Promise.all([
    quoteLeg({ account, row, side: "YES", action: "sell", volume: plan.yesVolume }),
    quoteLeg({ account, row, side: "NO", action: "sell", volume: plan.noVolume }),
  ]);

  const quotes = [yesQuote, noQuote].filter(Boolean) as UniswapQuoteTradeResult[];
  if (!quotes.length) return null;

  return { quoteType: "dual-sell", quotes, row, mintAmount: toAmount(plan.mintAmount) };
};

/**
 * Pick one plan per market. The arbitrage is tried first because its profit does not depend on the
 * user's number being right; only if there is no arb to take does the number decide anything.
 *
 * Which of the three prediction-driven shapes applies is `planZcashLegs`'s call — a probability can
 * land on either side of either pool, so all three sign pairs are reachable here in a way they were
 * not under the old yes/no model.
 */
const compareZcashQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: ZcashTableData;
}): Promise<ZcashQuoteResult | null> => {
  const arb = await arbSellZcashQuotes({ account, row });
  if (arb) return arb;

  if (!row.hasPrediction) return null;

  const plan = planZcashLegs(row);
  if (!plan) return null;

  switch (plan.kind) {
    case "dual-buy":
      return dualBuyZcashQuotes({ account, row, plan });
    case "dual-sell":
      return dualSellZcashQuotes({ account, row, plan });
    case "paired":
      return pairedZcashQuotes({ account, row, plan });
  }
};

/**
 * Sell tokens already held on a side that trades above target, before anything is minted.
 * Running this first turns dead inventory into sUSDS that the main pass can spend.
 */
const getSellFromBalanceForSide = async ({
  account,
  row,
  side,
}: {
  account: Address;
  row: ZcashTableData;
  side: ZcashSide;
}) => {
  const difference = sideDifference(row, side);
  if (difference == null || difference >= 0) return null;

  const balance = side === "YES" ? (row.yesBalance ?? 0n) : (row.noBalance ?? 0n);
  if (!balance) return null;

  // Never sell past the prediction: the bound is what it takes to reach the target price.
  const volume = Math.min(Number(formatUnits(balance, DECIMALS)), sideVolume(row, side));

  return quoteLeg({ account, row, side, action: "sell", volume });
};

export const getSellFromBalanceZcashQuotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: ZcashTableData[];
}) => {
  const legs: { row: ZcashTableData; side: ZcashSide }[] = [];

  for (const row of tableData) {
    // Skip rows with no real disagreement: selling a few thousandths of a token costs far more in
    // gas than the position is worth.
    if (!row.hasPrediction || !hasZcashEdge(row)) continue;
    legs.push({ row, side: "YES" }, { row, side: "NO" });
  }

  const { done, failed } = await settleWithRetry(legs, ({ row, side }) =>
    getSellFromBalanceForSide({ account, row, side }),
  );

  return {
    quotes: done.map(({ value }) => value).filter((quote): quote is UniswapQuoteTradeResult => !!quote),
    failed: failed.map(({ item, error }) => ({ row: item.row, error })),
  };
};

/** Unconditional liquidation of every outcome token held, for the "Sell all positions" action. */
export const getSellAllZcashQuotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: ZcashTableData[];
}) => {
  const legs: { row: ZcashTableData; side: ZcashSide; balance: bigint; token: Address }[] = [];
  for (const row of tableData) {
    for (const side of ["YES", "NO"] as ZcashSide[]) {
      const balance = side === "YES" ? row.yesBalance : row.noBalance;
      if (!balance) continue;
      const token = row.wrappedTokens[sideIndex(side)];
      if (!token) continue;
      legs.push({ row, side, balance, token });
    }
  }

  // A sell that fails to quote is retried, then reported: dropped, it left that position unsold
  // under a "Sold" ledger.
  const { done, failed } = await settleWithRetry(legs, ({ row, side, balance, token }) =>
    getUniswapQuote(
      CHAIN_ID,
      account,
      formatUnits(balance, DECIMALS),
      { address: token, symbol: side, decimals: DECIMALS },
      { address: row.collateralToken, symbol: row.project, decimals: DECIMALS },
      "sell",
    ),
  );
  return {
    quotes: done.map(({ value }) => value),
    failed: failed.map(({ item, error }): ZcashQuoteFailure => ({ row: item.row, error })),
  };
};

export const getZcashQuotes = async ({
  account,
  tableData,
  onProgress,
}: {
  account: Address;
  tableData: ZcashTableData[];
  onProgress?: (progress: number) => void;
}) => {
  if (!tableData.length) {
    throw new Error("Quote Error: Amount too small");
  }
  // Counts markets priced; one that fails every attempt is counted once it is given up on.
  let priced = 0;
  const { done, failed } = await settleWithRetry(tableData, (row) =>
    compareZcashQuotes({ account, row }).then((result) => {
      onProgress?.(++priced);
      return result;
    }),
  );
  if (failed.length) onProgress?.(priced + failed.length);

  return {
    results: done
      .map(({ value }) => value)
      .filter((result): result is ZcashQuoteResult => !!result),
    failed: failed.map(({ item, error }): ZcashQuoteFailure => ({ row: item, error })),
  };
};
