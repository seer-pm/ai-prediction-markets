import { OriginalityRow } from "@/types";
import { ARB_SUM_THRESHOLD, MIN_PRICE } from "@/utils/constants";
import { useMemo } from "react";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useOriginalityMarketsData } from "./useOriginalityMarketsData";
import { useTokensBalances } from "./useTokensBalances";

export const useProcessOriginalityPredictions = (predictions: OriginalityRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, isFetching, error } = useOriginalityMarketsData();
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

  const repoToPredictionMapping = useMemo(
    () =>
      predictions.reduce(
        (acc, curr) => {
          acc[curr.repo.replace("https://github.com/", "")] = curr;
          return acc;
        },
        {} as { [key: string]: OriginalityRow },
      ),
    [predictions],
  );

  const marketIdToRepo: { [key: string]: string } = {};
  const processedData = useMemo(() => {
    if (!data || !Object.keys(data.marketsData ?? {}).length) {
      return undefined;
    }
    return Object.entries(data.marketsData).map(([marketRepo, marketPoolData]) => {
      const prediction = repoToPredictionMapping[marketRepo];
      const { id: marketId, upPrice, downPrice, upPool, downPool } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
      marketIdToRepo[marketId] = marketRepo;

      // Prediction-independent arbitrage bounds: when UP+DOWN>1 we can mint a
      // complete set and sell both sides until each pool reaches its
      // proportional share of 1 (target_up = upPrice/sum, target_down = downPrice/sum).
      const sumPrice = (upPrice ?? 0) + (downPrice ?? 0);
      const isArb = sumPrice > 1 + ARB_SUM_THRESHOLD;
      const volumeUntilUpEqual =
        isArb && upPool && upPrice && market
          ? getVolumeUntilPrice(upPool, upPrice / sumPrice, market.wrappedTokens[1], "sell")
          : 0;
      const volumeUntilDownEqual =
        isArb && downPool && downPrice && market
          ? getVolumeUntilPrice(downPool, downPrice / sumPrice, market.wrappedTokens[0], "sell")
          : 0;

      if (!prediction) {
        return {
          repo: marketRepo,
          upPrice,
          downPrice,
          upDifference: null,
          downDifference: null,
          marketId,
          hasPrediction: false,
          volumeUntilUpPrice: 0,
          volumeUntilDownPrice: 0,
          volumeUntilUpEqual,
          volumeUntilDownEqual,
          downBalance: balanceMapping?.[market?.wrappedTokens?.[0] ?? ""],
          upBalance: balanceMapping?.[market?.wrappedTokens?.[1] ?? ""],
          predictedOriginality: null,
          wrappedTokens: market?.wrappedTokens ?? [],
          collateralToken: market?.collateralToken ?? zeroAddress,
        };
      }
      const upDifference = upPrice ? prediction.originality - upPrice : null;
      const downDifference = downPrice ? 1 - prediction.originality - downPrice : null;
      const volumeUntilUpPrice =
        upPool && upDifference && market
          ? getVolumeUntilPrice(
              upPool,
              Math.max(prediction.originality, MIN_PRICE), //cannot sell to 0 so we set a min price
              market.wrappedTokens[1],
              upDifference > 0 ? "buy" : "sell",
            )
          : 0;
      const volumeUntilDownPrice =
        downPool && downDifference && market
          ? getVolumeUntilPrice(
              downPool,
              Math.max(1 - prediction.originality, MIN_PRICE), //cannot sell to 0 so we set a min price
              market.wrappedTokens[0],
              downDifference > 0 ? "buy" : "sell",
            )
          : 0;
      const sum = (upPrice ?? 0) + (downPrice ?? 0);
      if (sum > 1.15 || sum < 0.85) {
        console.log(sum);
        console.log({
          repo: marketRepo,
          upPrice,
          downPrice,
          upDifference,
          downDifference,
          marketId,
          hasPrediction: true,
          volumeUntilUpPrice,
          volumeUntilDownPrice,
          downBalance: balanceMapping?.[market?.wrappedTokens?.[0] ?? ""],
          upBalance: balanceMapping?.[market?.wrappedTokens?.[1] ?? ""],
          predictedOriginality: prediction.originality,
          wrappedTokens: market?.wrappedTokens ?? [],
          collateralToken: market?.collateralToken ?? zeroAddress,
        });
      }
      return {
        repo: marketRepo,
        upPrice,
        downPrice,
        upDifference,
        downDifference,
        marketId,
        hasPrediction: true,
        volumeUntilUpPrice,
        volumeUntilDownPrice,
        volumeUntilUpEqual,
        volumeUntilDownEqual,
        downBalance: balanceMapping?.[market?.wrappedTokens?.[0] ?? ""],
        upBalance: balanceMapping?.[market?.wrappedTokens?.[1] ?? ""],
        predictedOriginality: prediction.originality,
        wrappedTokens: market?.wrappedTokens ?? [],
        collateralToken: market?.collateralToken ?? zeroAddress,
      };
    });
  }, [data, repoToPredictionMapping, balanceMapping]);

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
    marketIdToRepo,
    totalVolumeMapping: data.totalVolumeMapping,
  };
};
