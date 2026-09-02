import { PoolInfo } from "@/types";
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
}

const fetchZcashMarketsData = () =>
  fetchAppJson<GetZcashMarketsDataApiResult>("get-zcash-markets-data");

export const useZcashMarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Persisted data paints immediately and refreshes only once `staleTime` has passed. This used
    // to be `refetchOnMount: "always"` because chart history was stripped out of the persisted
    // snapshot to fit the localStorage quota, making every restore incomplete; charts now live in
    // their own query, so what is restored here is whole.
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["fetchZcashMarketsData"],
    queryFn: fetchZcashMarketsData,
  });
};
