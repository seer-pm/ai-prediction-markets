import { ChartWithMarketData, PoolInfo } from "@/types";
import { getAppUrl } from "@/utils/common";
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
  }[];
  charts: {
    [key: string]: ChartWithMarketData;
  } | null;
}

const fetchOriginalityMarketsData = async (): Promise<GetOriginalityMarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-originality-markets-data`);
    return await response.json();
  } catch {
    return { marketsData: {}, markets: [], charts: null };
  }
};

export const useOriginalityMarketsData = () => {
  return useQuery({
    queryKey: ["fetchOriginalityMarketsData"],
    queryFn: fetchOriginalityMarketsData,
  });
};
