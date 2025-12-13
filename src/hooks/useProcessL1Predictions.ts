import { PredictionRow, TableData } from "@/types";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useL1MarketsData } from "./useL1MarketsData";
import { useTokensBalances } from "./useTokensBalances";
import { OTHER_MARKET_ID } from "@/utils/constants";
import { isTwoStringsEqual } from "@/utils/common";

const MIN_PRICE = 0.0001;

export const useProcessL1Predictions = (predictions: PredictionRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, error } = useL1MarketsData();
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    checkResult?.predictedAddress,
    data?.wrappedTokens
  );
  const balanceMapping = balances?.reduce((acc, curr, index) => {
    const token = data?.wrappedTokens?.[index];
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
  }, {} as { [key: string]: PredictionRow });

  const processedData: TableData[] = Object.entries(data.marketsData)
    .map(([outcomeRepo, outcome]) => {
      const prediction = repoToPredictionMapping[outcomeRepo];
      const { id: outcomeId, pool, price: currentPrice } = outcome;

      if (!prediction) {
        return {
          repo: outcomeRepo,
          parent: null,
          currentPrice,
          predictedWeight: null,
          difference: null,
          outcomeId,
          hasPrediction: false,
          volumeUntilPrice: 0,
          balance: balanceMapping?.[outcomeId],
          isOther: isTwoStringsEqual(outcome.marketId, OTHER_MARKET_ID),
        };
      }
      const difference = currentPrice ? prediction.weight - currentPrice : null;
      const volumeUntilPrice =
        pool && difference
          ? getVolumeUntilPrice(
              pool,
              Math.max(prediction.weight, MIN_PRICE), //cannot sell to 0 so we set a min price
              outcomeId,
              difference > 0 ? "buy" : "sell"
            )
          : 0;
      return {
        repo: outcomeRepo,
        parent: prediction.parent,
        currentPrice,
        predictedWeight: prediction.weight,
        difference,
        outcomeId,
        hasPrediction: true,
        volumeUntilPrice,
        balance: balanceMapping?.[outcomeId],
        isOther: isTwoStringsEqual(outcome.marketId, OTHER_MARKET_ID),
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
