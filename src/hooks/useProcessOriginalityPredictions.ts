import { OriginalityRow, OriginalityTableData } from "@/types";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useOriginalityMarketsData } from "./useOriginalityMarketsData";
import { useTokensBalances } from "./useTokensBalances";
import { zeroAddress } from "viem";

const MIN_PRICE = 0.0001;

export const useProcessOriginalityPredictions = (predictions: OriginalityRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, error } = useOriginalityMarketsData();
  const tokens = data?.markets?.map((market) => market.wrappedTokens)?.flat();
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    checkResult?.predictedAddress,
    data?.markets?.map((market) => market.wrappedTokens)?.flat()
  );
  const balanceMapping = balances?.reduce((acc, curr, index) => {
    const token = tokens?.[index];
    if (!token) {
      return acc;
    }
    acc[token] = curr;
    return acc;
  }, {} as { [key: string]: bigint });
  if (!data || !Object.keys(data.marketsData ?? {}).length) {
    return {
      data: undefined,
      isLoading,
      isLoadingBalances,
      error,
    };
  }

  const repoToPredictionMapping = predictions.reduce((acc, curr) => {
    acc[curr.repo.replace("https://github.com/", "")] = curr;
    return acc;
  }, {} as { [key: string]: OriginalityRow });

  const processedData: OriginalityTableData[] = Object.entries(data.marketsData).map(
    ([marketRepo, marketPoolData]) => {
      const prediction = repoToPredictionMapping[marketRepo];
      const { id: marketId, upPrice, downPrice, upPool, downPool } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
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
        upPool && upDifference
          ? getVolumeUntilPrice(
              upPool,
              Math.max(prediction.originality, MIN_PRICE), //cannot sell to 0 so we set a min price
              marketId,
              upDifference > 0 ? "buy" : "sell"
            )
          : 0;
      const volumeUntilDownPrice =
        downPool && downDifference
          ? getVolumeUntilPrice(
              downPool,
              Math.max(1 - prediction.originality, MIN_PRICE), //cannot sell to 0 so we set a min price
              marketId,
              downDifference > 0 ? "buy" : "sell"
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
    }
  );

  return { data: processedData, isLoading, isLoadingBalances, error };
};
