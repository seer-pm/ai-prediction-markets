import { PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetMarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      price: number | null;
      pool: PoolInfo | null;
    };
  };
  wrappedTokens: Address[];
  payoutNumerators: string[]
}

const fetchMarketsData = () => fetchAppJson<GetMarketsDataApiResult>("get-markets-data");

export const useMarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Show persisted/cached data instantly, then refetch in the background on mount.
    refetchOnMount: true,
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useMarketsData"],
    queryFn: fetchMarketsData,
  });
};
