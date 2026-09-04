import { getVolumeUntilPrice } from "@/lib/trade/getVolumeUntilPrice";
import { ZcashNu7OutcomeRow, ZcashNu7Row, ZcashNu7TableData } from "@/types";
import { getZcashNu7Market, substantiveIndexes } from "@/utils/zcashNu7Markets";
import { completeNu7Targets, type Nu7TargetLeg } from "@/utils/zcashNu7Targets";
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
  | { kind: "no-pool"; question: number; outcome: number; label: string }
  /** The file named every pooled outcome of this question, but not to 1. Scaled onto 1. */
  | { kind: "sum-renormalised"; question: number; sum: number }
  /** The file's own rows claimed the whole question, so what it left out is being priced at ~0. */
  | { kind: "residual-exhausted"; question: number; unnamedCount: number };

/**
 * Turns a NU7 predictions CSV into one row per ballot question, each carrying one leg per
 * substantive outcome.
 *
 * Two levels because the two halves of a run live at different levels: the legs are per-outcome
 * (each has its own pool), but the mint is per-market (a complete set belongs to one question).
 *
 * The same complement `useProcessZcashPredictions` derives is derived here too, just over three or
 * four outcomes instead of two: the file states part of a distribution and `completeNu7Targets`
 * finishes it, so a question the user annotated always carries a full set of targets summing to 1.
 * An outcome left out is therefore *filled in*, not skipped. Only an omitted question is untraded.
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

      // Pass one: what the file said, and which outcomes could carry a target at all. A prediction
      // on an outcome with no pool cannot be traded — `quoteLeg` would throw on it — so it is
      // reported and then treated exactly as if the file had not mentioned that outcome.
      const legs = indexes.map((outcomeIndex, position) => {
        const outcomeNumber = position + 1;
        const token = market.wrappedTokens[outcomeIndex] as Address;
        const price = market.prices[outcomeIndex] ?? null;
        const pool = market.pools[outcomeIndex];
        const outcome = market.outcomes[outcomeIndex] ?? "";
        const raw = predictionByCell[`${question}-${outcomeNumber}`];

        if (raw !== undefined && (price === null || !pool)) {
          collected.push({ kind: "no-pool", question, outcome: outcomeNumber, label: outcome });
        }

        return {
          outcomeIndex,
          outcomeNumber,
          outcome,
          token,
          price,
          pool,
          balance: balanceByToken[token.toLowerCase()],
          raw,
        };
      });

      // Pass two: finish the question into a distribution, then diff each pool against it. Null
      // means the file never named this question, and nothing about it is traded.
      const completion = completeNu7Targets(
        legs.map(
          (leg): Nu7TargetLeg => ({
            outcomeNumber: leg.outcomeNumber,
            price: leg.pool ? leg.price : null,
            raw: leg.raw,
          }),
        ),
      );

      if (completion?.note === "renormalised") {
        collected.push({ kind: "sum-renormalised", question, sum: completion.namedSum });
      }
      if (completion?.note === "residual-exhausted") {
        collected.push({
          kind: "residual-exhausted",
          question,
          unnamedCount: completion.derivedCount,
        });
      }

      const outcomes: ZcashNu7OutcomeRow[] = legs.map((leg) => {
        const base = {
          outcomeIndex: leg.outcomeIndex,
          outcomeNumber: leg.outcomeNumber,
          outcome: leg.outcome,
          token: leg.token,
          price: leg.price,
          balance: leg.balance,
        };

        const target = completion?.targets.get(leg.outcomeNumber) ?? null;
        if (target === null || leg.price === null || !leg.pool) {
          return {
            ...base,
            target: null,
            difference: null,
            volumeUntilPrice: 0,
            source: null,
            hasTarget: false,
          };
        }

        const difference = target - leg.price;

        // `!== 0` rather than a truthiness check: a difference of exactly 0 is a real answer
        // ("this pool is already where the number would put it") and must not be read as "no price".
        const volumeUntilPrice =
          difference !== 0
            ? getVolumeUntilPrice(leg.pool, target, leg.token, difference > 0 ? "buy" : "sell")
            : 0;

        return {
          ...base,
          target,
          difference,
          volumeUntilPrice,
          source: completion?.source.get(leg.outcomeNumber) ?? null,
          hasTarget: true,
        };
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
