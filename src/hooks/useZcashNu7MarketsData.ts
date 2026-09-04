import { PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { MarketStatus } from "@seer-pm/sdk";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

export interface ZcashNu7MarketData {
  id: Address;
  /** The ballot question, verbatim from chain. */
  marketName: string;
  /** Outcome strings in on-chain order; the last is always "Invalid result". */
  outcomes: string[];
  /** Same order as `outcomes`. */
  wrappedTokens: Address[];
  collateralToken: Address;
  payoutReported: boolean;
  payoutNumerators: string[];
  marketStatus: MarketStatus;
  /** Ballot label, e.g. "Q1". Joined server-side from `@/utils/zcashNu7Markets`. */
  shortName: string;
  topic: string;
  /** Per outcome, in `outcomes` order. `null` for Invalid and for any outcome with no pool. */
  prices: (number | null)[];
  pools: (PoolInfo | null)[];
}

interface GetZcashNu7MarketsDataApiResult {
  markets: ZcashNu7MarketData[];
}

const fetchZcashNu7MarketsData = () =>
  fetchAppJson<GetZcashNu7MarketsDataApiResult>("get-zcash-nu7-markets-data");

export const useZcashNu7MarketsData = () => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["fetchZcashNu7MarketsData"],
    queryFn: fetchZcashNu7MarketsData,
  });
};
