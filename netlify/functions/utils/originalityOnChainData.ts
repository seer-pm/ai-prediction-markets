import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsDocument, GetPoolsQuery, GetPoolsQueryVariables } from "@/gql/graphql";
import { PoolInfo } from "@/types";
import { getToken0Token1, isTwoStringsEqual, tickToTokenPrices } from "@/utils/common";
import { Address } from "viem";
import { EDGE_CACHE_HEADERS } from "./cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./cors";
import type { MarketOnChain } from "./marketView";

interface OriginalityOnChainSet {
  /** Repo and address of each market, in the order `fetchMarkets` returns them. */
  marketList: readonly { repo: string; address: Address }[];
  fetchParent: () => Promise<MarketOnChain>;
  fetchMarkets: () => Promise<MarketOnChain[]>;
}

/**
 * Prices for a round-3 Originality set, in the same response shape as
 * `get-originality-markets-data` so the tab and its hooks serve every round unchanged. Both
 * round-3 sets — the corrected one and the first, incorrect one — are served through here.
 *
 * Two things differ from round 2, and both are forced by the chain:
 *  - The markets come from MarketView, not Supabase — the sets postdate Seer's indexer stall.
 *  - The repo is NOT `parent.outcomes[parentOutcome]`. The round-3 parent is a 3-outcome
 *    multi-scalar ("Bundle A/B/C"), and a repo market's `parentOutcome` is a bundle index in the
 *    first set and a slot inside its bundle's middle market in the corrected one — neither names
 *    the repo against this parent. The repo comes from `marketList` instead, which was generated
 *    from the creation log and pairs each market address with its repo.
 */
export async function serveOriginalityOnChainData(
  req: Request,
  { marketList, fetchParent, fetchMarkets }: OriginalityOnChainSet,
): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  try {
    const [parent, markets] = await Promise.all([fetchParent(), fetchMarkets()]);

    const queryResult = await UniswapGraphQLClient.query<GetPoolsQuery, GetPoolsQueryVariables>({
      query: GetPoolsDocument,
      // The shared client caches cache-first for the life of a warm instance, which would keep
      // serving the pre-seed "no pools" answer after the pools exist. Prices must be live.
      fetchPolicy: "no-cache",
      variables: {
        first: 1000,
        where: {
          // Each pool pairs DOWN or UP with the market's own collateral: its bundle token in the
          // first set, its repo token in the corrected one.
          or: markets.flatMap(({ wrappedTokens, collateralToken }) =>
            wrappedTokens.slice(0, -1).map((token) => getToken0Token1(token, collateralToken)),
          ),
        },
      },
    });
    // A transport failure, not an empty result: an unseeded set must fall through to null prices.
    if (!queryResult.data) {
      throw new Error("Pool query failed");
    }

    // we only use the pool with highest liquidity for each pair
    const tokenPairToPoolMapping = queryResult.data.pools.reduce(
      (acc, pool) => {
        const mappingKey = `${pool.token0.id}-${pool.token1.id}`;
        if (!acc[mappingKey] || Number(pool.liquidity) > Number(acc[mappingKey].liquidity)) {
          acc[mappingKey] = pool;
        }
        return acc;
      },
      {} as { [key: string]: GetPoolsQuery["pools"][0] },
    );

    const getPoolByTokenPair = (outcome: Address, collateral: Address): (PoolInfo & { price: number }) | null => {
      const { token0, token1 } = getToken0Token1(outcome, collateral);
      const pool = tokenPairToPoolMapping[`${token0}-${token1}`];
      if (!pool) return null;
      const [price0, price1] = tickToTokenPrices(Number(pool.tick));
      return {
        liquidity: pool.liquidity,
        tick: pool.tick,
        token0: pool.token0.id,
        token1: pool.token1.id,
        ticks: pool.ticks,
        feeTier: pool.feeTier,
        price: isTwoStringsEqual(outcome, token0) ? price0 : price1,
      };
    };

    const repoToPriceMapping: {
      [repo: string]: {
        id: Address;
        upPrice: number | null;
        downPrice: number | null;
        upPool: PoolInfo | null;
        downPool: PoolInfo | null;
      };
    } = {};
    // `fetchMarkets` returns markets in `marketList` order.
    markets.forEach((market, index) => {
      const entry = marketList[index];
      if (!entry || !isTwoStringsEqual(entry.address, market.id)) {
        throw new Error(`market ${market.id} does not match the market list at ${index}`);
      }
      // wrappedTokens order is [DOWN, UP, Invalid].
      const downPool = getPoolByTokenPair(market.wrappedTokens[0], market.collateralToken);
      const upPool = getPoolByTokenPair(market.wrappedTokens[1], market.collateralToken);
      repoToPriceMapping[entry.repo] = {
        id: market.id,
        upPrice: upPool?.price ?? null,
        upPool,
        downPrice: downPool?.price ?? null,
        downPool,
      };
    });

    return new Response(
      JSON.stringify({
        marketsData: repoToPriceMapping,
        markets: markets.map(({ id, wrappedTokens, collateralToken, parentOutcome, marketStatus }) => ({
          id,
          wrappedTokens,
          collateralToken,
          parentOutcome,
          marketStatus,
        })),
        parentWrappedTokens: parent.wrappedTokens,
      }),
      {
        status: 200,
        headers: {
          ...EDGE_CACHE_HEADERS,
          ...corsHeaders,
        },
      },
    );
  } catch (e: unknown) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
}
