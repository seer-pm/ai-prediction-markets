import type { GetBurnsQuery, GetMintsQuery, GetSwapsQuery } from "@seer-pm/sdk/subgraph/swapr";

/**
 * The DEX operation the published `@seer-pm/sdk` does not generate.
 *
 * Seer's workspace copy (`D:\Code\demo\packages\seer-pm-sdk\queries\swapr.graphql`) gained
 * `GetAccountDexEvents` in `a9aacfe7`; npm's 0.0.18 stops at the separate `GetSwaps` /
 * `GetMints` / `GetBurns`. Fetching all three in one POST is the whole point — it is what
 * takes a wallet's DEX pass from three paginated streams down to one. Kept verbatim against
 * the same schema so a later SDK release can replace this file wholesale.
 *
 * **Delete this file once the SDK catches up**, exactly as with `envioQueries.ts`.
 */
export const GET_ACCOUNT_DEX_EVENTS = /* GraphQL */ `
  query GetAccountDexEvents(
    $first: Int
    $swapWhere: Swap_filter
    $mintWhere: Mint_filter
    $burnWhere: Burn_filter
    $orderDirection: OrderDirection
    $subgraphError: _SubgraphErrorPolicy_! = deny
  ) {
    swaps(
      first: $first
      orderBy: timestamp
      orderDirection: $orderDirection
      where: $swapWhere
      subgraphError: $subgraphError
    ) {
      id
      sender
      recipient
      origin
      amount0
      amount1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      timestamp
      transaction {
        id
        blockNumber
      }
      tick
      pool {
        id
        liquidity
        token0 {
          id
          name
        }
        token1 {
          id
          name
        }
      }
    }
    mints(
      first: $first
      orderBy: timestamp
      orderDirection: $orderDirection
      where: $mintWhere
      subgraphError: $subgraphError
    ) {
      id
      owner
      amount0
      amount1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      timestamp
      transaction {
        id
        blockNumber
      }
    }
    burns(
      first: $first
      orderBy: timestamp
      orderDirection: $orderDirection
      where: $burnWhere
      subgraphError: $subgraphError
    ) {
      id
      owner
      amount0
      amount1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      timestamp
      transaction {
        id
        blockNumber
      }
    }
  }
`;

export type GetAccountDexEventsQueryVariables = {
  first?: number;
  swapWhere?: Record<string, unknown>;
  mintWhere?: Record<string, unknown>;
  burnWhere?: Record<string, unknown>;
  orderDirection?: unknown;
};

/**
 * Shaped from the SDK's generated per-stream types so the row fields stay in sync with the
 * schema. `origin` is the one field the generated `GetSwaps` selection omits, and the flow
 * reducers need it — a swap is attributed to the wallet that originated the transaction.
 */
export type GetAccountDexEventsQuery = {
  swaps: (GetSwapsQuery["swaps"][number] & { origin: `0x${string}` | null })[];
  mints: GetMintsQuery["mints"][number][];
  burns: GetBurnsQuery["burns"][number][];
};
