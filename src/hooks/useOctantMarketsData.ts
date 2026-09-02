import { PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { MarketStatus } from "@seer-pm/sdk";
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
  marketStatus: MarketStatus;
}

// Throwing rather than returning a stub also keeps the redeem flow honest: `data` is `undefined` on
// failure, so nothing can read a `marketStatus` that looks like a resolved market.
const fetchMarketsData = () => fetchAppJson<GetMarketsDataApiResult>("get-octant-markets-data");

export const useOctantMarketsData = () => {
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
    queryKey: ["useOctantMarketsData"],
    queryFn: fetchMarketsData,
  });
};
