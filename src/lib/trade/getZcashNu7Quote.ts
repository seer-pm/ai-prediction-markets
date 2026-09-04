import {
  UniswapQuoteTradeResult,
  ZcashNu7OutcomeRow,
  ZcashNu7QuoteResult,
  ZcashNu7TableData,
} from "@/types";
import { CHAIN_ID, DECIMALS, VOLUME_MIN, collateral } from "@/utils/constants";
import { nu7BuyScale, planZcashNu7Legs } from "@/utils/zcashNu7Budget";
import { Address, formatUnits } from "viem";
import { getUniswapQuote } from "./getQuote";

/**
 * Trade planning for the Zcash NU7 ballot: five categorical questions of three to four competing
 * outcomes, each outcome with its own sUSDS pool.
 *
 * Two things make this simpler than `getZcashQuote`, not harder:
 *
 * 1. **No paired legs.** The binary set has two pools pricing the same question, so every branch
 *    there has to move both to keep YES+NO near 1. Here each outcome is priced by its own pool and
 *    the user's targets are absolute, so a leg is just a leg: sell the ones trading above the number
 *    the user gave, buy the ones trading below it, and leave everything they said nothing about.
 * 2. **One mint serves every sell leg.** A complete set yields one of *every* outcome, so a single
 *    `splitPosition` per market funds all of that question's sells at once. `planZcashNu7Legs` sizes
 *    it against the hungriest of them.
 *
 * Like the binary set there is **no parent market** — these are top-level markets collateralized in
 * sUSDS, so minting in one does nothing for the other four. The mint budget is divided across
 * questions by the caller and arrives as `row.amount`.
 *
 * Minting also yields an Invalid token that is never sold, and tokens on any outcome the user did not
 * ask about. Both are left in the wallet deliberately, exactly as `getZcashQuote` documents for its
 * own Invalid token — a complete set redeems for exactly 1, so this is capital parked, not lost, and
 * "Sell all positions" clears the tradable part of it in one click.
 */

/** Uniswap quotes take a decimal string; 15 places is well inside an 18-decimal token. */
const toAmount = (value: number) => value.toFixed(15);

/**
 * One leg. `volume` is the swap input: collateral for a buy, outcome tokens for a sell.
 * Returns null (rather than throwing) for a leg too small to be worth a transaction, or for an
 * outcome with no pool — quoting that one would only throw.
 */
const quoteLeg = async ({
  account,
  row,
  leg,
  action,
  volume,
}: {
  account: Address;
  row: ZcashNu7TableData;
  leg: ZcashNu7OutcomeRow;
  action: "buy" | "sell";
  volume: number;
}): Promise<UniswapQuoteTradeResult | null> => {
  if (!(volume >= VOLUME_MIN)) return null;
  if (leg.price === null) return null;

  return getUniswapQuote(
    CHAIN_ID,
    account,
    toAmount(volume),
    { address: leg.token, symbol: leg.outcome, decimals: DECIMALS },
    { address: row.collateralToken, symbol: collateral.symbol, decimals: DECIMALS },
    action,
  ).catch(() => null);
};

/**
 * Quote one question's legs.
 *
 * The sells are priced first because their proceeds fund the buys: `planZcashNu7Legs` could only
 * estimate that at the current price, and by the time we are here the real quoted output is known,
 * so the buy scale is recomputed from it. Same division of labour as `planPaired` and
 * `pairedZcashQuotes` in the binary contest.
 */
export const getZcashNu7MarketQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: ZcashNu7TableData;
}): Promise<ZcashNu7QuoteResult | null> => {
  const plan = planZcashNu7Legs(row);
  if (!plan) return null;

  const legByIndex = new Map(row.outcomes.map((leg) => [leg.outcomeIndex, leg]));

  const sellQuotes = (
    await Promise.all(
      plan.sells.map((sell) => {
        const leg = legByIndex.get(sell.outcomeIndex);
        return leg ? quoteLeg({ account, row, leg, action: "sell", volume: sell.volume }) : null;
      }),
    )
  ).filter(Boolean) as UniswapQuoteTradeResult[];

  // The real number, replacing `plan.estProceeds`. A sell whose quote came back empty contributes
  // nothing, so an unfundable buy is scaled down rather than reverting on chain.
  const proceeds = sellQuotes.reduce(
    (sum, quote) => sum + Number(formatUnits(quote.value, DECIMALS)),
    0,
  );
  const buyScale = nu7BuyScale(plan.buyTotal, plan.cashAfterMint + proceeds);

  const buyQuotes = (
    await Promise.all(
      plan.buys.map((buy) => {
        const leg = legByIndex.get(buy.outcomeIndex);
        return leg
          ? quoteLeg({ account, row, leg, action: "buy", volume: buy.volume * buyScale })
          : null;
      }),
    )
  ).filter(Boolean) as UniswapQuoteTradeResult[];

  if (!sellQuotes.length && !buyQuotes.length) return null;

  return {
    quoteType: sellQuotes.length && buyQuotes.length ? "mixed" : sellQuotes.length ? "sell" : "buy",
    // Sells before buys, and this order survives into the batch: `getQuoteTradeCalls` preserves it,
    // which is what makes the sell proceeds available to the buys inside one `batchExecute`.
    quotes: [...sellQuotes, ...buyQuotes],
    row,
    mintAmount: toAmount(plan.mintAmount),
  };
};

export const getZcashNu7Quotes = async ({
  account,
  tableData,
  onProgress,
}: {
  account: Address;
  tableData: ZcashNu7TableData[];
  onProgress?: (progress: number) => void;
}) => {
  let currentProgress = 0;
  const quotePromises = tableData.map((row) =>
    getZcashNu7MarketQuotes({ account, row }).then((result) => {
      currentProgress++;
      onProgress?.(currentProgress);
      return result;
    }),
  );

  if (!quotePromises.length) {
    throw new Error("Quote Error: Amount too small");
  }

  // One question whose pools have been withdrawn must not sink the other four.
  const results = await Promise.allSettled(quotePromises);
  return results.reduce((quotes, result) => {
    if (result.status === "fulfilled" && result.value) {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as ZcashNu7QuoteResult[]);
};
