import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsQueryVariables, OrderDirection, Pool_OrderBy } from "@/gql/graphql";
import { CHAIN_ID } from "@/utils/constants";
import { gql } from "@apollo/client";
import type { SupportedChain } from "@seer-pm/sdk";
import { GetPoolHourDatasQuery } from "@seer-pm/sdk/subgraph/swapr";
import { createClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);
const GetPoolIdsDocument = gql(`
  query GetPoolIds(
    $first: Int!
    $where: Pool_filter
    $orderBy: Pool_orderBy!
    $orderDirection: OrderDirection!
  ) {
    pools(
      first: $first
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
    }
  }
`);
export async function getPoolIds(tokenPairs: { token0: Address; token1: Address }[]) {
  const maxAttempts = 10;
  let attempt = 0;
  let lastId: string | undefined;

  const ids: string[] = [];

  while (attempt < maxAttempts) {
    const { data } = await UniswapGraphQLClient.query<
      { pools: { id: string }[] },
      GetPoolsQueryVariables
    >({
      query: GetPoolIdsDocument,
      variables: {
        first: 1000,
        where: {
          and: [{ or: tokenPairs }, ...(lastId ? [{ id_lt: lastId }] : [])],
        },
        orderBy: Pool_OrderBy.Id,
        orderDirection: OrderDirection.Desc,
      },
    });

    if (!data) throw new Error("No pools found");

    const pools = data.pools;

    ids.push(...pools.map((p) => p.id));

    if (pools.length < 1000) break;

    lastId = pools[pools.length - 1].id;
    attempt++;
  }

  return ids;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export async function getChartData(poolIds: string[]) {
  return await getPoolHourDatas(CHAIN_ID, poolIds);
}

type DexPoolHourPriceRow = {
  chain_id: number;
  pool_id: string;
  token0_id: string;
  token1_id: string;
  token0_price: string | number;
  token1_price: string | number;
  period_start_unix: number;
};

async function getPoolHourDatasByPoolIds(
  chainId: SupportedChain,
  poolIds: string[],
): Promise<GetPoolHourDatasQuery["poolHourDatas"]> {
  const PAGE_SIZE = 1000;

  let from = 0;
  let allRows: DexPoolHourPriceRow[] = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("dex_pool_hour_prices")
      .select(
        `
        chain_id,
        pool_id,
        token0_id,
        token1_id,
        token0_price,
        token1_price,
        period_start_unix
      `,
      )
      .eq("chain_id", chainId)
      .in("pool_id", poolIds)
      .order("period_start_unix", { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const rows = data ?? [];

    allRows = allRows.concat(rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allRows.map((row) => ({
    id: `${row.pool_id}-${row.period_start_unix}`,
    token0Price: String(row.token0_price),
    token1Price: String(row.token1_price),
    periodStartUnix: Number(row.period_start_unix),
    sqrtPrice: "0",
    liquidity: "0",
    pool: {
      id: row.pool_id,
      liquidity: "0",
      token0: {
        id: row.token0_id,
        name: "",
      },
      token1: {
        id: row.token1_id,
        name: "",
      },
    },
  })) as GetPoolHourDatasQuery["poolHourDatas"];
}

export async function getPoolHourDatas(chainId: SupportedChain, poolIds: string[]) {
  if (poolIds.length === 0) {
    return [];
  }

  const BATCH_SIZE = 100;
  const batches = chunk(poolIds, BATCH_SIZE);

  const limit = pLimit(3);

  const batchResults = await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const poolHourDatas = await getPoolHourDatasByPoolIds(chainId, batch);

        return poolHourDatas.sort((a, b) => a.periodStartUnix - b.periodStartUnix);
      }),
    ),
  );

  return batchResults.flat();
}
