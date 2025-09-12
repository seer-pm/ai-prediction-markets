import { PoolInfo } from "@/types";
import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

interface GetMarketsDataApiResult {
  [key: string]: {
    id: Address;
    price: number;
    pool: PoolInfo;
  };
}

const fetchMarketsData = async (): Promise<GetMarketsDataApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-markets-data`);
    return await response.json();
  } catch {
    return {};
  }
};

export const useMarketsData = (enabled: boolean) => {
  return useQuery({
    enabled,
    queryKey: ["useMarketsData"],
    queryFn: fetchMarketsData,
  });
};
