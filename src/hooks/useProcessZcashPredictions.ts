import { ZcashRow, ZcashTableData } from "@/types";
import { ARB_SUM_THRESHOLD, MIN_PRICE } from "@/utils/constants";
import { getZcashMarketByTitle, NO_INDEX, YES_INDEX } from "@/utils/zcashMarkets";
import { useMemo } from "react";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useTokensBalances } from "./useTokensBalances";
import { useZcashMarketsData } from "./useZcashMarketsData";

/**
 * Turns a predictions CSV into one row per Zcash proposal.
 *
 * Each market is an independent binary question, so YES and NO target prices sum to 1 *within a
 * market* rather than across the contest. That is the Originality model, not the Octant/L1 one
 * where every outcome competes for a share of a single pot.
 *
 * The CSV carries a probability, so the prediction *is* the price the YES pool is aimed at and its
 * complement is the NO target. Nothing is clamped by direction: unlike a yes/no call, a number can
 * legitimately sit above one pool and below the other, and both differences can share a sign when
 * YES+NO is away from 1. `getZcashQuote` is what decides which shape that is.
 */
export const useProcessZcashPredictions = (predictions: ZcashRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, isFetching, error } = useZcashMarketsData();
  const tokens = useMemo(
    () => data?.markets?.map((market) => market.wrappedTokens)?.flat(),
    [data?.markets],
  );
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    checkResult?.predictedAddress,
    tokens,
  );
  const balanceMapping = useMemo(
    () =>
      balances?.reduce(
        (acc, curr, index) => {
          const token = tokens?.[index];
          if (!token) {
            return acc;
          }
          acc[token] = curr;
          return acc;
        },
        {} as { [key: string]: bigint },
      ),
    [balances, tokens],
  );

  const projectToPredictionMapping = useMemo(
    () =>
      predictions.reduce(
        (acc, curr) => {
          acc[curr.project.toLowerCase()] = curr;
          return acc;
        },
        {} as { [key: string]: ZcashRow },
      ),
    [predictions],
  );

  // Memoized independently of `processedData` below so it stays populated even on
  // renders where that memo bails out (unrelated state changes elsewhere in the tree) —
  // otherwise chart legend labels intermittently render blank.
  const marketIdToProject = useMemo(() => {
    const mapping: { [key: string]: string } = {};
    for (const [project, marketPoolData] of Object.entries(data?.marketsData ?? {})) {
      mapping[marketPoolData.id] = project;
    }
    return mapping;
  }, [data?.marketsData]);

  const processedData = useMemo<ZcashTableData[] | undefined>(() => {
    if (!data || !Object.keys(data.marketsData ?? {}).length) {
      return undefined;
    }
    return Object.entries(data.marketsData).map(([project, marketPoolData]) => {
      const prediction = projectToPredictionMapping[project.toLowerCase()];
      const { id: marketId, yesPrice, noPrice, yesPool, noPool } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
      const ballot = getZcashMarketByTitle(project);

      // Prediction-independent arbitrage bounds: when YES+NO>1 we can mint a
      // complete set and sell both sides until each pool reaches its
      // proportional share of 1 (target_yes = yesPrice/sum, target_no = noPrice/sum).
      const sumPrice = (yesPrice ?? 0) + (noPrice ?? 0);
      const isArb = sumPrice > 1 + ARB_SUM_THRESHOLD;
      const volumeUntilYesEqual =
        isArb && yesPool && yesPrice && market
          ? getVolumeUntilPrice(
              yesPool,
              yesPrice / sumPrice,
              market.wrappedTokens[YES_INDEX],
              "sell",
            )
          : 0;
      const volumeUntilNoEqual =
        isArb && noPool && noPrice && market
          ? getVolumeUntilPrice(noPool, noPrice / sumPrice, market.wrappedTokens[NO_INDEX], "sell")
          : 0;

      const base = {
        project,
        applicant: ballot?.applicant ?? "",
        requestedUsd: ballot?.requestedUsd ?? 0,
        tier: ballot?.tier ?? "",
        yesPrice,
        noPrice,
        marketId,
        volumeUntilYesEqual,
        volumeUntilNoEqual,
        yesBalance: balanceMapping?.[market?.wrappedTokens?.[YES_INDEX] ?? ""],
        noBalance: balanceMapping?.[market?.wrappedTokens?.[NO_INDEX] ?? ""],
        wrappedTokens: market?.wrappedTokens ?? [],
        collateralToken: market?.collateralToken ?? zeroAddress,
      };

      if (!prediction) {
        return {
          ...base,
          predictedProbability: null,
          yesDifference: null,
          noDifference: null,
          hasPrediction: false,
          volumeUntilYesPrice: 0,
          volumeUntilNoPrice: 0,
        };
      }

      // The prediction is the YES target price outright. `MIN_PRICE` keeps the bound off the
      // extremes — a pool cannot be sold to 0 — the same guard `useProcessOriginalityPredictions`
      // applies to its scalar pairs.
      const yesTarget = Math.min(Math.max(prediction.probability, MIN_PRICE), 1 - MIN_PRICE);
      const noTarget = 1 - yesTarget;

      const yesDifference = yesPrice === null ? null : yesTarget - yesPrice;
      const noDifference = noPrice === null ? null : noTarget - noPrice;
      // `!= null` rather than a truthiness check: a difference of exactly 0 is a real answer
      // ("this side is already where the number would put it") and must not be confused with "no
      // price".
      const volumeUntilYesPrice =
        yesPool && yesDifference != null && yesDifference !== 0 && market
          ? getVolumeUntilPrice(
              yesPool,
              yesTarget,
              market.wrappedTokens[YES_INDEX],
              yesDifference > 0 ? "buy" : "sell",
            )
          : 0;
      const volumeUntilNoPrice =
        noPool && noDifference != null && noDifference !== 0 && market
          ? getVolumeUntilPrice(
              noPool,
              noTarget,
              market.wrappedTokens[NO_INDEX],
              noDifference > 0 ? "buy" : "sell",
            )
          : 0;

      return {
        ...base,
        predictedProbability: prediction.probability,
        yesDifference,
        noDifference,
        hasPrediction: true,
        volumeUntilYesPrice,
        volumeUntilNoPrice,
      };
    });
  }, [data, projectToPredictionMapping, balanceMapping]);

  if (!data || !Object.keys(data.marketsData ?? {}).length) {
    return {
      data: undefined,
      isLoading,
      isFetching,
      isLoadingBalances,
      error,
    };
  }

  return {
    data: processedData,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
    charts: data.charts,
    marketIdToProject,
    totalVolumeMapping: data.totalVolumeMapping,
  };
};
