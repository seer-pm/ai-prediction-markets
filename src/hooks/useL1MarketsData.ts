import { ChartWithMarketData, PoolInfo } from "@/types";
import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetMarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      price: number | null;
      pool: PoolInfo | null;
      marketId: Address;
    };
  };
  wrappedTokens: Address[];
  payoutNumerators: string[];
  charts: {
    [key: string]: ChartWithMarketData;
  } | null;
  totalVolumeMapping: {
    [key: string]: string;
  } | null;
}

const fetchMarketsData = async (): Promise<GetMarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-l1-markets-data`);
    return await response.json();
  } catch {
    return {
      marketsData: {},
      wrappedTokens: [],
      payoutNumerators: [],
      charts: null,
      totalVolumeMapping: null,
    };
  }
};

export const useL1MarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Show persisted/cached data instantly, then refetch in the background on mount.
    refetchOnMount: true,
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useL1MarketsData"],
    queryFn: fetchMarketsData,
  });
};
