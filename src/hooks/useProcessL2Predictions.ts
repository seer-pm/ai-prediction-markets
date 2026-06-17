import { L2Row, L2TableData } from "@/types";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useL2MarketsData } from "./useL2MarketsData";
import { useTokensBalances } from "./useTokensBalances";
import { MIN_PRICE } from "@/utils/constants";

export const useProcessL2Predictions = (predictions: L2Row[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, isFetching, error } = useL2MarketsData();
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

  const dependencyToPredictionMapping = useMemo(
    () =>
      predictions.reduce(
        (acc, curr) => {
          const dependency = curr.dependency.replace("https://github.com/", "").toLowerCase();
          const repo = curr.repo.replace("https://github.com/", "").toLowerCase();
          acc[`${dependency}-${repo}`] = curr;
          return acc;
        },
        {} as { [key: string]: L2Row },
      ),
    [predictions],
  );

  const processedData = useMemo(() => {
    if (!data || !Object.keys(data.marketsData ?? {}).length) {
      return undefined;
    }
    return Object.entries(data.marketsData)
      .reduce((acc, [marketRepo, marketPoolData]) => {
      const { id: marketId, prices, pools } = marketPoolData;
      const market = data.markets.find((market) => market.id === marketId);
      if (!market) return acc;
      for (let i = 0; i < market.wrappedTokens.length; i++) {
        const dependency = market.outcomes[i];
        const prediction =
          dependencyToPredictionMapping[`${dependency.toLowerCase()}-${marketRepo.toLowerCase()}`];

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
          continue;
        }
        const difference = currentPrice ? prediction.weight - currentPrice : null;
        const volumeUntilPrice =
          pool && difference
            ? getVolumeUntilPrice(
                pool,
                Math.max(prediction.weight, MIN_PRICE), //cannot sell to 0 so we set a min price
                outcomeId,
                difference > 0 ? "buy" : "sell",
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
    }, [] as L2TableData[])
      .sort((a, b) => {
        return a.repo.toLowerCase() > b.repo.toLowerCase() ? 1 : -1;
      });
  }, [data, dependencyToPredictionMapping, balanceMapping]);

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
    totalVolumeMapping: data.totalVolumeMapping
  };
};
