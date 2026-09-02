import { MarketViewAbi } from "@/abis/MarketViewAbi";
import { OPTIMISM_RPC } from "@/config/rpc";
import { Address, createPublicClient, http } from "viem";
import { optimism } from "viem/chains";
import { getMarketStatus } from "./marketStatus";

/**
 * Reading markets straight off chain, bypassing Seer's `markets` table.
 *
 * Two contests need this. The 37 Zcash markets are not in the table at all — its newest Optimism
 * row predates their 2026-08-19 creation. The L1 markets are in it, but Seer's indexer stalled on
 * Optimism at block 156,195,946 (2026-08-29) and so never saw their 2026-08-31 resolution: the row
 * still reports `payoutReported: false` with all-zero numerators, which would hide the redeem CTA
 * indefinitely. MarketView returns everything the table would have — outcomes, wrapped tokens,
 * collateral, payouts and the Reality questions the status derives from — and is always current.
 */

/** MarketView and a market factory, both on Optimism, both read-only. */
const MARKET_VIEW = "0x336695ec9efbafd6322fb82eaadbcda02e38f348" as const;
/**
 * `getMarket` takes a factory but does not check that it created the market: the factory only
 * supplies the ConditionalTokens/Realitio singletons, which are shared across factory versions on
 * Optimism. Verified against the L1 parent, created by an earlier factory than this one — it comes
 * back fully populated. So one address serves every contest here; don't "fix" this per market.
 */
const MARKET_FACTORY = "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6" as const;

/**
 * Deliberately not `readContractsInBatch` from `src/lib/on-chain`: that runs on the browser wagmi
 * config, which calls `createAppKit()` as an import side effect.
 */
const publicClient = createPublicClient({ chain: optimism, transport: http(OPTIMISM_RPC) });

export interface MarketOnChain {
  id: Address;
  marketName: string;
  outcomes: string[];
  /** In outcome order — which is what `redeemPositions` indexes against. */
  wrappedTokens: Address[];
  collateralToken: Address;
  payoutReported: boolean;
  payoutNumerators: string[];
  /** Which outcome of the parent market collateralizes this one. 0 when there is no parent. */
  parentOutcome: number;
  marketStatus: ReturnType<typeof getMarketStatus>;
}

/**
 * One multicall covers the whole set. `allowFailure: false` because a partial answer is worse than
 * an error: a missing market reads as "nothing to redeem" / silently drops rows from a tab.
 *
 * Results come back in `addresses` order, which callers rely on to pair a market with its metadata.
 */
export async function fetchMarketsOnChain(addresses: readonly Address[]): Promise<MarketOnChain[]> {
  const results = await publicClient.multicall({
    contracts: addresses.map((address) => ({
      address: MARKET_VIEW as Address,
      abi: MarketViewAbi,
      functionName: "getMarket" as const,
      args: [MARKET_FACTORY as Address, address],
    })),
    allowFailure: false,
  });

  return results.map((market) => ({
    id: market.id as Address,
    marketName: market.marketName,
    outcomes: [...market.outcomes],
    wrappedTokens: [...market.wrappedTokens] as Address[],
    collateralToken: market.collateralToken as Address,
    payoutReported: market.payoutReported,
    payoutNumerators: market.payoutNumerators.map((numerator) => numerator.toString()),
    parentOutcome: Number(market.parentOutcome),
    // MarketView returns questions flat; `getMarketStatus` expects the subgraph's nested shape.
    marketStatus: getMarketStatus({
      payoutReported: market.payoutReported,
      questions: market.questions.map((question) => ({
        question: {
          opening_ts: question.opening_ts.toString(),
          finalize_ts: question.finalize_ts.toString(),
          is_pending_arbitration: question.is_pending_arbitration,
        },
      })),
    }),
  }));
}
