import { PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { MarketStatus } from "@seer-pm/sdk";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetOriginalityMarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      upPrice: number | null;
      upPool: PoolInfo | null;
      downPrice: number | null;
      downPool: PoolInfo | null;
    };
  };
  markets: {
    id: Address;
    wrappedTokens: Address[];
    collateralToken: Address;
    parentOutcome: number;
    marketStatus: MarketStatus;
  }[];
  parentWrappedTokens: Address[];
}

const fetchOriginalityMarketsData = () =>
  fetchAppJson<GetOriginalityMarketsDataApiResult>("get-originality-markets-data");

export const useOriginalityMarketsData = () => {
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
    queryKey: ["fetchOriginalityMarketsData"],
    queryFn: fetchOriginalityMarketsData,
  });
};
