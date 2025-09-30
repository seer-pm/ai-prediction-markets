import { PredictionRow, TableData } from "@/types";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useMarketsData } from "./useMarketsData";
import { useTokensBalances } from "./useTokensBalances";

const MIN_PRICE = 0.0001;

export const useProcessPredictions = (predictions: PredictionRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, error } = useMarketsData();
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    checkResult?.predictedAddress,
    data?.wrappedTokens
  );
  const balanceMapping = balances?.reduce((acc, curr, index) => {
    const token = data?.wrappedTokens?.[index];
    if (!token) {
      return acc;
    }
    acc[token] = curr
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
  }, {} as { [key: string]: PredictionRow });

  const processedData: TableData[] = Object.entries(data.marketsData)
    .map(([marketRepo, market]) => {
      const prediction = repoToPredictionMapping[marketRepo];
      const { id: marketId, pool, price: currentPrice } = market;

      if (!prediction) {
        return {
          repo: marketRepo,
          parent: null,
          currentPrice,
          predictedWeight: null,
          difference: null,
          marketId,
          hasPrediction: false,
          volumeUntilPrice: 0,
          balance: balanceMapping?.[marketId],
        };
      }
      const difference = currentPrice ? prediction.weight - currentPrice : null;
      const volumeUntilPrice =
        pool && difference
          ? getVolumeUntilPrice(
              pool,
              Math.max(prediction.weight, MIN_PRICE), //cannot sell to 0 so we set a min price
              marketId,
              difference > 0 ? "buy" : "sell"
            )
          : 0;
      return {
        repo: marketRepo,
        parent: prediction.parent,
        currentPrice,
        predictedWeight: prediction.weight,
        difference,
        marketId,
        hasPrediction: true,
        volumeUntilPrice,
        balance: balanceMapping?.[marketId],
      };
    })
    .sort((a, b) => {
      if (a.currentPrice === null && b.currentPrice === null) return 0;
      if (a.currentPrice === null) return 1;
      if (b.currentPrice === null) return -1;
      return b.currentPrice - a.currentPrice;
    });

  return { data: processedData, isLoading, isLoadingBalances, error };
};
