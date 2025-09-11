import { useQuery } from "@tanstack/react-query";
import { type MarketData, type PredictionRow } from "../types";
import { getAppUrl } from "../utils/utils";

const fetchMarketPrices = async (): Promise<Record<string, number>> => {
  const response = await fetch(`${getAppUrl()}/.netlify/functions/get-markets-prices`);
  return await response.json();
};

export const useMarkets = () => {
  return useQuery({
    queryKey: ["useMarkets"],
    queryFn: fetchMarketPrices,
  });
};

export const useProcessPredictions = (predictions: PredictionRow[]) => {
  const { data: marketPrices, isLoading, error } = useMarkets();

  const processedData: MarketData[] = predictions
    .map((pred) => {
      const currentPrice = marketPrices?.[pred.repo] || 0;
      const difference = pred.weight - currentPrice;

      return {
        repo: pred.repo,
        parent: pred.parent,
        currentPrice,
        predictedWeight: pred.weight,
        difference,
        marketId: `market_${pred.repo}`,
      };
    })
    .sort((a, b) => b.currentPrice - a.currentPrice);

  return { data: processedData, isLoading, error };
};
