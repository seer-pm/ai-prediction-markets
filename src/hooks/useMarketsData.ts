import { PoolInfo } from "@/types";
import { getAppUrl } from "@/utils/common";
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
}

const fetchMarketsData = async (): Promise<GetMarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-markets-data`);
    return await response.json();
  } catch {
    return { marketsData: {}, wrappedTokens: [] };
  }
};

export const useMarketsData = () => {
  return useQuery({
    queryKey: ["useMarketsData"],
    queryFn: fetchMarketsData,
  });
};
