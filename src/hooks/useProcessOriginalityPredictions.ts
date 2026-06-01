import { OriginalityRow } from "@/types";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useOriginalityMarketsData } from "./useOriginalityMarketsData";
import { useTokensBalances } from "./useTokensBalances";
import { zeroAddress } from "viem";
import { MIN_PRICE } from "@/utils/constants";

export const useProcessOriginalityPredictions = (predictions: OriginalityRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, error } = useOriginalityMarketsData();
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
    return Object.entries(data.marketsData).map(
    ([marketRepo, marketPoolData]) => {
      const prediction = repoToPredictionMapping[marketRepo];
      const { id: marketId, upPrice, downPrice, upPool, downPool } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
      marketIdToRepo[marketId] = marketRepo;
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
      isLoadingBalances,
      error,
    };
  }

  return {
    data: processedData,
    isLoading,
    isLoadingBalances,
    error,
    charts: data.charts,
    marketIdToRepo,
    totalVolumeMapping: data.totalVolumeMapping
  };
};
