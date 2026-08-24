import { ZcashRow, ZcashTableData } from "@/types";
import { ARB_SUM_THRESHOLD, ZCASH_TARGET_PRICE } from "@/utils/constants";
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
 * The CSV carries a yes/no call, not a number. `ZCASH_TARGET_PRICE` turns that call into the price
 * each pool is aimed at, and the differences below are clamped so a row never trades against its
 * own call.
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
          predictedApproved: null,
          yesDifference: null,
          noDifference: null,
          hasPrediction: false,
          volumeUntilYesPrice: 0,
          volumeUntilNoPrice: 0,
        };
      }

      // A yes/no call has no number of its own, so it aims each pool at `ZCASH_TARGET_PRICE`.
      const target = prediction.approved ? ZCASH_TARGET_PRICE : 1 - ZCASH_TARGET_PRICE;

      // Clamped by direction so a call can never trade against itself. An approve on a market
      // already above the target clamps to 0 on both sides, drops out of `isZcashRowFundable` and
      // is skipped — rather than selling YES on a proposal the user just said would pass.
      const rawYes = yesPrice === null ? null : target - yesPrice;
      const rawNo = noPrice === null ? null : 1 - target - noPrice;
      const yesDifference =
        rawYes === null ? null : prediction.approved ? Math.max(0, rawYes) : Math.min(0, rawYes);
      const noDifference =
        rawNo === null ? null : prediction.approved ? Math.min(0, rawNo) : Math.max(0, rawNo);
      // `!= null` rather than a truthiness check: a difference of exactly 0 is a real answer
      // ("this side is already where the call would put it") and must not be confused with "no
      // price". With a clamped target that is the common case, not an edge case.
      const volumeUntilYesPrice =
        yesPool && yesDifference != null && yesDifference !== 0 && market
          ? getVolumeUntilPrice(
              yesPool,
              target,
              market.wrappedTokens[YES_INDEX],
              yesDifference > 0 ? "buy" : "sell",
            )
          : 0;
      const volumeUntilNoPrice =
        noPool && noDifference != null && noDifference !== 0 && market
          ? getVolumeUntilPrice(
              noPool,
              1 - target,
              market.wrappedTokens[NO_INDEX],
              noDifference > 0 ? "buy" : "sell",
            )
          : 0;

      return {
        ...base,
        predictedApproved: prediction.approved,
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
