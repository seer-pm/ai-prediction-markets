import { UniswapGraphQLClient } from "@/config/apollo";
import { getToken0Token1 } from "@/utils/common";
import { gql } from "@apollo/client";
import { Address } from "viem";

/**
 * All-time swap volume per token pair, read off the pool entities.
 *
 * This used to be summed from the `swaps` the chart job already downloads (`buildVolumeIndex`), and
 * that had two problems. It was only ever as current as the 15-minute cron — there was no way to
 * answer "what is the volume *now*" without re-walking every swap of every pool — and the swap
 * pagination it rode on cursors by `id` while ordering by `timestamp`, so any swap whose id sorts
 * below the page cursor is skipped and the total silently undercounts.
 *
 * The subgraph already maintains `volumeToken0`/`volumeToken1` as running totals of the same
 * absolute amounts, so one query per 100 pools replaces the whole walk. Both callers — the cron and
 * the on-demand `refresh-market-volume` — read it through here, which is what keeps a refreshed
 * number from being reverted by the next cron run.
 */

/** Aggregated over every pool of the pair: a token can trade against the collateral at several fee tiers. */
export type PoolVolumeData = {
  token0: Address;
  token1: Address;
  token0Name: string;
  token1Name: string;
  totalVolume0: number;
  totalVolume1: number;
};

/** Pools are keyed by their ordered token pair, which is what the writers can reconstruct. */
export function poolPairKey(token: Address, collateral: Address) {
  const { token0, token1 } = getToken0Token1(token, collateral);
  return `${token0.toLowerCase()}_${token1.toLowerCase()}`;
}

const GetPoolVolumesDocument = gql(`
  query GetPoolVolumes($first: Int!, $where: Pool_filter) {
    pools(first: $first, where: $where) {
      id
      volumeToken0
      volumeToken1
      token0 { id name }
      token1 { id name }
    }
  }
`);

type PoolVolumeRow = {
  id: string;
  volumeToken0: string;
  volumeToken1: string;
  token0: { id: string; name: string };
  token1: { id: string; name: string };
};

/** Pool ids per query. Matches the chart job's batch size for the same subgraph. */
const BATCH_SIZE = 100;

export async function getPoolVolumes(poolIds: string[]): Promise<Map<string, PoolVolumeData>> {
  const index = new Map<string, PoolVolumeData>();
  const ids = [...new Set(poolIds.map((id) => id.toLowerCase()))];

  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const { data } = await UniswapGraphQLClient.query<{ pools: PoolVolumeRow[] }>({
      query: GetPoolVolumesDocument,
      variables: { first: 1000, where: { id_in: batch } },
      // The point of this module is to answer "now"; Apollo's default cache would hand a warm
      // lambda the same totals it returned on the previous invocation.
      fetchPolicy: "no-cache",
    });

    for (const pool of data?.pools ?? []) {
      const token0 = pool.token0.id.toLowerCase() as Address;
      const token1 = pool.token1.id.toLowerCase() as Address;
      const key = `${token0}_${token1}`;

      const current = index.get(key) ?? {
        token0,
        token1,
        token0Name: pool.token0.name,
        token1Name: pool.token1.name,
        totalVolume0: 0,
        totalVolume1: 0,
      };
      current.totalVolume0 += Number(pool.volumeToken0) || 0;
      current.totalVolume1 += Number(pool.volumeToken1) || 0;
      index.set(key, current);
    }
  }

  return index;
}
