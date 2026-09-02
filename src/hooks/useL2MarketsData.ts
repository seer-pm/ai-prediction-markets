import { PoolInfo } from "@/types";
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
}

const fetchL2MarketsData = () => fetchAppJson<GetL2MarketsDataApiResult>("get-l2-markets-data");

export const useL2MarketsData = () => {
  return useQuery({
    // This one payload is by far the largest, so keep the retry-once the hand-rolled fetcher used
    // to do — expressed as React Query's own retry now that a failure actually throws.
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Persisted data paints immediately and refreshes only once `staleTime` has passed. This used
    // to be `refetchOnMount: "always"` because chart history was stripped out of the persisted
    // snapshot to fit the localStorage quota, making every restore incomplete; charts now live in
    // their own query, so what is restored here is whole.
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["fetchL2MarketsData"],
    queryFn: () => fetchL2MarketsData(),
  });
};
