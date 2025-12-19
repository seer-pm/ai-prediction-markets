import { L2Row, L2TableData } from "@/types";
import { useAccount } from "wagmi";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useL2MarketsData } from "./useL2MarketsData";
import { useTokensBalances } from "./useTokensBalances";

const MIN_PRICE = 0.0001;

export const useProcessL2Predictions = (predictions: L2Row[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, error } = useL2MarketsData();
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

  const dependencyToPredictionMapping = predictions.reduce((acc, curr) => {
    acc[curr.dependency.replace("https://github.com/", "")] = curr;
    return acc;
  }, {} as { [key: string]: L2Row });

  const processedData: L2TableData[] = Object.entries(data.marketsData).reduce(
    (acc, [marketRepo, marketPoolData]) => {
      const { id: marketId, prices, pools } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
      if (!market) return acc;
      for (let i = 0; i < market.wrappedTokens.length; i++) {
        const dependency = market.outcomes[i];
        const prediction = dependencyToPredictionMapping[dependency];
        const outcomeId = market.wrappedTokens[i];
        const currentPrice = prices[i];
        const pool = pools[i];
        if (!prediction) {
          acc.push({
            marketId,
            repo: marketRepo,
            dependency,
            currentPrice,
            predictedWeight: null,
            difference: null,
            outcomeId,
            hasPrediction: false,
            volumeUntilPrice: 0,
            balance: balanceMapping?.[outcomeId],
            collateralToken: market.collateralToken,
            wrappedTokens: market.wrappedTokens,
          });
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
        acc.push({
          marketId,
          repo: marketRepo,
          dependency,
          currentPrice,
          predictedWeight: prediction.weight,
          difference,
          outcomeId,
          hasPrediction: true,
          volumeUntilPrice,
          balance: balanceMapping?.[outcomeId],
          collateralToken: market.collateralToken,
          wrappedTokens: market.wrappedTokens,
        });
      }

      return acc;
    },
    [] as L2TableData[]
  );

  return { data: processedData, isLoading, isLoadingBalances, error };
};
