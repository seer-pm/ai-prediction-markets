import { MarketViewAbi } from "@/abis/MarketViewAbi";
import { OPTIMISM_RPC } from "@/config/rpc";
import { ZCASH_MARKETS } from "@/utils/zcashMarkets";
import { Address, createPublicClient, http } from "viem";
import { optimism } from "viem/chains";
import { getMarketStatus } from "./marketStatus";

/**
 * Reading the Zcash market set straight off chain.
 *
 * Every other contest gets its markets from Seer's `markets` table. The 37 Zcash markets are not in
 * it — its newest Optimism row predates their 2026-08-19 creation — so there is no query that would
 * find them. MarketView returns everything the table would have: outcomes, wrapped tokens,
 * collateral, payouts and the Reality questions the status derives from.
 *
 * Shared by `get-zcash-markets-data` and the chart job so the two cannot disagree about what the
 * market set is.
 */

/** MarketView and the factory that created the set, both on Optimism, both read-only. */
const MARKET_VIEW = "0x336695ec9efbafd6322fb82eaadbcda02e38f348" as const;
const MARKET_FACTORY = "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6" as const;

/**
 * Deliberately not `readContractsInBatch` from `src/lib/on-chain`: that runs on the browser wagmi
 * config, which calls `createAppKit()` as an import side effect.
 */
const publicClient = createPublicClient({ chain: optimism, transport: http(OPTIMISM_RPC) });

export interface ZcashMarketOnChain {
  id: Address;
  marketName: string;
  outcomes: string[];
  /** `[YES, NO, INVALID]`. */
  wrappedTokens: Address[];
  collateralToken: Address;
  payoutReported: boolean;
  payoutNumerators: string[];
  marketStatus: ReturnType<typeof getMarketStatus>;
}

/**
 * One multicall covers all 37. `allowFailure: false` because a partial market set is worse than an
 * error: it would silently drop proposals from the tab.
 *
 * Order matches `ZCASH_MARKETS`, which callers rely on to pair a result with its ballot metadata.
 */
export async function fetchZcashMarketsOnChain(): Promise<ZcashMarketOnChain[]> {
  const results = await publicClient.multicall({
    contracts: ZCASH_MARKETS.map((market) => ({
      address: MARKET_VIEW as Address,
      abi: MarketViewAbi,
      functionName: "getMarket" as const,
      args: [MARKET_FACTORY as Address, market.address],
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
