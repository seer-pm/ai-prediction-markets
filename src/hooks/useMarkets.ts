import { useQuery } from '@tanstack/react-query';
import { MarketData, PredictionRow } from '../types';

// Mock API function - replace with real API later
const fetchMarketPrices = async (): Promise<Record<string, number>> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock data - replace with real API call
  return {
    'https://github.com/a16z/helios': 0.01500000,
    'https://github.com/ethereum/go-ethereum': 0.02100000,
    'https://github.com/ConsenSys/quorum': 0.00890000,
    'https://github.com/hyperledger/besu': 0.01200000,
    'https://github.com/OpenEthereum/openethereum': 0.00750000,
  };
};

export const useMarkets = () => {
  return useQuery({
    queryKey: ['markets'],
    queryFn: fetchMarketPrices,
  });
};

export const useProcessPredictions = (predictions: PredictionRow[]) => {
  const { data: marketPrices, isLoading, error } = useMarkets();
  
  const processedData: MarketData[] = predictions.map((pred, index) => {
    const currentPrice = marketPrices?.[pred.repo] || 0;
    const difference = pred.weight - currentPrice;
    
    return {
      repo: pred.repo,
      parent: pred.parent,
      currentPrice,
      predictedWeight: pred.weight,
      difference,
      marketId: `market_${index}`,
    };
  }).sort((a, b) => b.currentPrice - a.currentPrice);
  
  return { data: processedData, isLoading, error };
};