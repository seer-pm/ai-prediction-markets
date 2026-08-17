import { ChartWithMarketData, PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
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

const fetchMarketsData = () => fetchAppJson<GetMarketsDataApiResult>("get-l1-markets-data");

export const useL1MarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Show persisted/cached data instantly, then refetch in the background on mount.
    // "always" (not `true`) because `charts` is stripped from the persisted cache
    // to fit the localStorage quota — the restored data is intentionally
    // incomplete, so we must refetch on every mount regardless of staleTime to
    // refill charts (otherwise a reload within staleTime shows "No Chart Data").
    refetchOnMount: "always",
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useL1MarketsData"],
    queryFn: fetchMarketsData,
  });
};
