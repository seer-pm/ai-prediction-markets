import { PoolInfo } from "@/types";
import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetL2MarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      prices: (number | null)[]
      pools: (PoolInfo | null)[]
    };
  };
  markets: {
    id: Address
    wrappedTokens: Address[]
    collateralToken: Address
    outcomes: string[]
  }[]
}

const fetchL2MarketsData = async (): Promise<GetL2MarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-l2-markets-data`);
    return await response.json();
  } catch {
    return { marketsData: {}, markets: [] };
  }
};

export const useL2MarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryKey: ["fetchL2MarketsData"],
    queryFn: fetchL2MarketsData,
  });
};
