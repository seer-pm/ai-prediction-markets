import { OctantRow, TableData } from "@/types";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { getVolumeUntilPrice } from "../lib/trade/getVolumeUntilPrice";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useOctantMarketsData } from "./useOctantMarketsData";
import { useTokensBalances } from "./useTokensBalances";
import { MIN_PRICE } from "@/utils/constants";

export const useProcessOctantPredictions = (predictions: OctantRow[]) => {
  const { address: account } = useAccount();
  const { data: checkResult } = useCheckTradeExecutorCreated(account);
  const { data, isLoading, isFetching, error } = useOctantMarketsData();
  const tokens = useMemo(() => data?.wrappedTokens, [data?.wrappedTokens]);
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

  const projectToPredictionMapping = useMemo(
    () =>
      predictions.reduce(
        (acc, curr) => {
          acc[curr.project.toLowerCase()] = curr;
          return acc;
        },
        {} as { [key: string]: OctantRow },
      ),
    [predictions],
  );

  const processedData: TableData[] | undefined = useMemo(() => {
    if (!data || !Object.keys(data.marketsData ?? {}).length) {
      return undefined;
    }
    return Object.entries(data.marketsData)
      .map(([outcomeName, outcome]) => {
        const prediction = projectToPredictionMapping[outcomeName.toLowerCase()];
        const { id: outcomeId, pool, price: currentPrice } = outcome;
        if (!prediction) {
          return {
            repo: outcomeName,
            parent: null,
            currentPrice,
            predictedWeight: null,
            difference: null,
            outcomeId,
            hasPrediction: false,
            volumeUntilPrice: 0,
            balance: balanceMapping?.[outcomeId],
            isOther: false,
          };
        }
        const difference = currentPrice ? prediction.weight - currentPrice : null;
        const volumeUntilPrice =
          pool && difference
            ? getVolumeUntilPrice(
                pool,
                Math.max(prediction.weight, MIN_PRICE),
                outcomeId,
                difference > 0 ? "buy" : "sell",
              )
            : 0;
        return {
          repo: outcomeName,
          parent: null,
          currentPrice,
          predictedWeight: prediction.weight,
          difference,
          outcomeId,
          hasPrediction: true,
          volumeUntilPrice,
          balance: balanceMapping?.[outcomeId],
          isOther: false,
        };
      })
      .sort((a, b) => {
        if (a.currentPrice === null && b.currentPrice === null) return 0;
        if (a.currentPrice === null) return 1;
        if (b.currentPrice === null) return -1;
        return b.currentPrice - a.currentPrice;
      });
  }, [data, projectToPredictionMapping, balanceMapping]);

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
    totalVolumeMapping: data.totalVolumeMapping,
  };
};
