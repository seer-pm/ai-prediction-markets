import { ChartWithMarketData, PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { MarketStatus } from "@seer-pm/sdk";

interface GetL2MarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      prices: (number | null)[];
      pools: (PoolInfo | null)[];
    };
  };
  markets: {
    id: Address;
    wrappedTokens: Address[];
    collateralToken: Address;
    outcomes: string[];
    marketStatus: MarketStatus;
  }[];
  charts: {
    [key: string]: ChartWithMarketData;
  } | null;
  totalVolumeMapping: {
    [key: string]: string;
  } | null;
}

const fetchL2MarketsData = () => fetchAppJson<GetL2MarketsDataApiResult>("get-l2-markets-data");

export const useL2MarketsData = () => {
  return useQuery({
    // This one payload is by far the largest, so keep the retry-once the hand-rolled fetcher used
    // to do — expressed as React Query's own retry now that a failure actually throws.
    retry: 1,
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
    queryKey: ["fetchL2MarketsData"],
    queryFn: () => fetchL2MarketsData(),
  });
};
