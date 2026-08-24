import { ChartWithMarketData, PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { MarketStatus } from "@seer-pm/sdk";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetZcashMarketsDataApiResult {
  /** Keyed by proposal title — see `utils/zcashMarkets`. */
  marketsData: {
    [key: string]: {
      id: Address;
      yesPrice: number | null;
      yesPool: PoolInfo | null;
      noPrice: number | null;
      noPool: PoolInfo | null;
    };
  };
  markets: {
    id: Address;
    marketName: string;
    outcomes: string[];
    /** `[YES, NO, INVALID]`. */
    wrappedTokens: Address[];
    collateralToken: Address;
    payoutReported: boolean;
    payoutNumerators: string[];
    marketStatus: MarketStatus;
  }[];
  charts: {
    [key: string]: ChartWithMarketData;
  } | null;
  totalVolumeMapping: {
    [key: string]: string;
  } | null;
}

const fetchZcashMarketsData = () =>
  fetchAppJson<GetZcashMarketsDataApiResult>("get-zcash-markets-data");

export const useZcashMarketsData = () => {
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
    queryKey: ["fetchZcashMarketsData"],
    queryFn: fetchZcashMarketsData,
  });
};
