import { PoolInfo } from "@/types";
import { fetchAppJson } from "@/utils/common";
import { MarketStatus } from "@seer-pm/sdk";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

/** One level of the L1 contest, as the redeem needs it: tokens in outcome order, plus its status. */
interface L1MarketLevel {
  id: Address;
  wrappedTokens: Address[];
  marketStatus: MarketStatus;
  /**
   * In outcome order, so `payoutRatios` can price a claim. Optional: the persisted cache can
   * restore a snapshot written before this field existed.
   */
  payoutNumerators?: string[];
  /** Child level only — the parent outcome whose token collateralizes it. */
  parentOutcome?: number;
}

interface GetMarketsDataApiResult {
  marketsData: {
    [key: string]: {
      id: Address;
      price: number | null;
      pool: PoolInfo | null;
      marketId: Address;
    };
  };
  /** Parent tokens followed by child tokens — indexed against `marketsData`, never reordered. */
  wrappedTokens: Address[];
  payoutNumerators: string[];
  /** Read on chain, so these are current even while Seer's indexer lags. */
  parentMarket: L1MarketLevel;
  /** The nested "Other repositories" market, collateralized in the parent's outcome-66 token. */
  otherMarket: L1MarketLevel;
}

const fetchMarketsData = () => fetchAppJson<GetMarketsDataApiResult>("get-l1-markets-data");

export const useL1MarketsData = () => {
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
    queryKey: ["useL1MarketsData"],
    queryFn: fetchMarketsData,
  });
};
