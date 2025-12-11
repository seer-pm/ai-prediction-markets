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
      marketId: Address
    };
  };
  wrappedTokens: Address[];
  payoutNumerators: string[]
}

const fetchMarketsData = async (): Promise<GetMarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-l1-markets-data`);
    return await response.json();
  } catch {
    return { marketsData: {}, wrappedTokens: [], payoutNumerators: [] };
  }
};

export const useL1MarketsData = () => {
  return useQuery({
    queryKey: ["useL1MarketsData"],
    queryFn: fetchMarketsData,
  });
};
