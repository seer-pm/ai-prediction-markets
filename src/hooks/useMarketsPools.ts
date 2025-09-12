
import { useQuery } from "@tanstack/react-query";
import { getAppUrl } from "../utils/utils";

interface GetMarketsPoolsApiResult {
    [key: string]: {
        price: number;
        tick: {
            tickIdx: string;
            liquidityNet: string
        }
    }
}

const fetchMarketsPools = async (): Promise<GetMarketsPoolsApiResult> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-markets-pools`);
    return await response.json();
  } catch (e) {
    return {};
  }
};

export const useMarketsPools = (enabled: boolean) => {
  return useQuery({
    enabled,
    queryKey: ["useMarketsPools"],
    queryFn: fetchMarketsPools,
  });
};
