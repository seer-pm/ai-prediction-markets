import { PredictionRow, TableData } from "@/types";
import { useMarketsData } from "./useMarketsData";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";

export const useProcessPredictions = (predictions: PredictionRow[]) => {
  const { data: marketsData, isLoading, error } = useMarketsData(predictions.length > 0);

  const processedData: TableData[] = predictions
    .map((pred) => {
      const repo = pred.repo.replace("https://github.com/", "");
      const market = marketsData?.[repo];
      if (!market) {
        return {
          repo,
          parent: pred.parent,
          currentPrice: 0,
          predictedWeight: pred.weight,
          difference: 0,
          marketId: repo,
          hasMarketData: false,
          volumeUntilPrice: 0,
        };
      }
      const { id, price: currentPrice, pool } = market;
      const difference = pred.weight - currentPrice;
      const volumeUntilPrice = getVolumeUntilPrice(
        pool,
        pred.weight,
        id,
        difference > 0 ? "buy" : "sell"
      );
      return {
        repo,
        parent: pred.parent,
        currentPrice,
        predictedWeight: pred.weight,
        difference,
        marketId: id,
        hasMarketData: true,
        volumeUntilPrice,
      };
    })
    .sort((a, b) => b.currentPrice - a.currentPrice);

  return { data: processedData, isLoading, error };
};
