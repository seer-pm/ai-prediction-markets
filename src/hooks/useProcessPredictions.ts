import { MarketData, PredictionRow } from "../types";
import { useMarketsPools } from "./useMarketsPools";

export const useProcessPredictions = (predictions: PredictionRow[]) => {
  const { data: marketsPools, isLoading, error } = useMarketsPools(predictions.length > 0);

  const processedData: MarketData[] = predictions
    .map((pred) => {
      const repo = pred.repo.replace('https://github.com/', '')
      const currentPrice = marketsPools?.[repo]?.price || 0;
      const difference = pred.weight - currentPrice;

      return {
        repo,
        parent: pred.parent,
        currentPrice,
        predictedWeight: pred.weight,
        difference,
        marketId: `market_${repo}`,
      };
    })
    .sort((a, b) => b.currentPrice - a.currentPrice);

  return { data: processedData, isLoading, error };
};
