import { getVolumeUntilPrice } from "@/lib/trade/getVolumeUntilPrice";
import { ZcashNu7OutcomeRow, ZcashNu7Row, ZcashNu7TableData } from "@/types";
import { MIN_PRICE } from "@/utils/constants";
import { getZcashNu7Market, substantiveIndexes } from "@/utils/zcashNu7Markets";
import { useMemo } from "react";
import { Address } from "viem";
import { useTokensBalances } from "./useTokensBalances";
import { useTradeWalletStatus } from "./useTradeWalletStatus";
import { useZcashNu7MarketsData } from "./useZcashNu7MarketsData";

/**
 * A row in the uploaded file that names something the ballot does not have. Reported rather than
 * thrown: the file is already parsed and in localStorage by the time this runs, so throwing would
 * strand the user with no route back but **Clear**.
 */
export type Nu7PredictionIssue =
  | { kind: "no-such-outcome"; question: number; outcome: number; substantiveCount: number }
  | { kind: "no-pool"; question: number; outcome: number; label: string };

/**
 * Turns a NU7 predictions CSV into one row per ballot question, each carrying one leg per
 * substantive outcome.
 *
 * Two levels because the two halves of a run live at different levels: the legs are per-outcome
 * (each has its own pool), but the mint is per-market (a complete set belongs to one question).
 *
 * Unlike `useProcessZcashPredictions` there is no complement to derive — a prediction is an absolute
 * target for one pool, so an outcome the file left out simply has no target and is never traded.
 */
export const useProcessZcashNu7Predictions = (predictions: ZcashNu7Row[]) => {
  const { tradeExecutor } = useTradeWalletStatus();
  const { data, isLoading, isFetching, error } = useZcashNu7MarketsData();

  const markets = useMemo(() => data?.markets ?? [], [data?.markets]);

  // Every outcome token of every market, flat and in market-then-outcome order. Owned here rather
  // than in the tab so the card, the preflight stats and the planner cannot disagree about balances.
  const allTokens = useMemo(() => markets.flatMap((market) => market.wrappedTokens), [markets]);

  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    tradeExecutor as Address,
    allTokens,
  );

  const balanceByToken = useMemo(() => {
    const mapping: Record<string, bigint> = {};
    allTokens.forEach((token, index) => {
      const balance = balances?.[index];
      if (balance !== undefined) mapping[token.toLowerCase()] = balance;
    });
    return mapping;
  }, [allTokens, balances]);

  // Keyed on `question-outcome`, the same pair the parser rejects duplicates of.
  const predictionByCell = useMemo(() => {
    const mapping: Record<string, number> = {};
    for (const row of predictions) {
      mapping[`${row.question}-${row.outcome}`] = row.prediction;
    }
    return mapping;
  }, [predictions]);

  const { data: tableData, issues } = useMemo(() => {
    if (!markets.length) {
      return { data: undefined as ZcashNu7TableData[] | undefined, issues: [] as Nu7PredictionIssue[] };
    }

    const collected: Nu7PredictionIssue[] = [];

    const rows = markets.map((market) => {
      const indexes = substantiveIndexes(market.outcomes);
      // The ballot number the CSV keys on. Resolved from the address rather than parsed out of
      // `shortName`, so the label stays cosmetic and only `ZCASH_NU7_MARKETS` defines the numbering.
      const question = getZcashNu7Market(market.id)?.id ?? 0;

      // A prediction naming an outcome this question does not have. The parser could not catch it —
      // outcome counts only exist on chain — so it is caught here and dropped.
      for (const key of Object.keys(predictionByCell)) {
        const [q, o] = key.split("-").map(Number);
        if (q === question && o > indexes.length) {
          collected.push({
            kind: "no-such-outcome",
            question: q,
            outcome: o,
            substantiveCount: indexes.length,
          });
        }
      }

      const outcomes: ZcashNu7OutcomeRow[] = indexes.map((outcomeIndex, position) => {
        const outcomeNumber = position + 1;
        const token = market.wrappedTokens[outcomeIndex] as Address;
        const price = market.prices[outcomeIndex] ?? null;
        const pool = market.pools[outcomeIndex];
        const raw = predictionByCell[`${question}-${outcomeNumber}`];

        const base = {
          outcomeIndex,
          outcomeNumber,
          outcome: market.outcomes[outcomeIndex] ?? "",
          token,
          price,
          balance: balanceByToken[token.toLowerCase()],
        };

        if (raw === undefined) {
          return { ...base, target: null, difference: null, volumeUntilPrice: 0, hasPrediction: false };
        }

        // A prediction on an outcome with no pool cannot be traded, and `quoteLeg` would throw on it.
        if (price === null || !pool) {
          collected.push({ kind: "no-pool", question, outcome: outcomeNumber, label: base.outcome });
          return { ...base, target: null, difference: null, volumeUntilPrice: 0, hasPrediction: false };
        }

        // `MIN_PRICE` keeps the bound off the extremes — a pool cannot be sold to 0, and
        // `getVolumeUntilPrice` divides by the target. Same guard the other contests apply.
        const target = Math.min(Math.max(raw, MIN_PRICE), 1 - MIN_PRICE);
        const difference = target - price;

        // `!== 0` rather than a truthiness check: a difference of exactly 0 is a real answer
        // ("this pool is already where the number would put it") and must not be read as "no price".
        const volumeUntilPrice =
          difference !== 0
            ? getVolumeUntilPrice(pool, target, token, difference > 0 ? "buy" : "sell")
            : 0;

        return { ...base, target, difference, volumeUntilPrice, hasPrediction: true };
      });

      return {
        marketId: market.id,
        question,
        shortName: market.shortName,
        marketName: market.marketName,
        collateralToken: market.collateralToken,
        wrappedTokens: market.wrappedTokens,
        outcomes,
        marketStatus: market.marketStatus,
      } satisfies ZcashNu7TableData;
    });

    return { data: rows, issues: collected };
  }, [markets, predictionByCell, balanceByToken]);

  return {
    data: tableData,
    /** Raw market data, for the redeem scope and the sell-all position list. */
    markets,
    balanceByToken,
    balances,
    allTokens,
    issues,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
  };
};
