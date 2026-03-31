import { UniswapGraphQLClient } from "@/config/apollo";
import { GetPoolsQueryVariables, OrderDirection, Pool_OrderBy } from "@/gql/graphql";
import { CHAIN_ID } from "@/utils/constants";
import { gql } from "@apollo/client";
import type { SupportedChain } from "@seer-pm/sdk";
import {
  getSubgraphUrl,
  isOpStack,
  swaprGraphQLClient,
  tickToPrice,
  uniswapGraphQLClient
} from "@seer-pm/sdk";
import { GetPoolHourDatasQuery, GetSwapsQuery } from "@seer-pm/sdk/subgraph/swapr";
import { TickMath } from "@uniswap/v3-sdk";
import pLimit from "p-limit";
import { Address } from "viem";
import { gnosis, mainnet } from "viem/chains";

let count = 0;
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

async function getPoolHourDatasByPoolIds(chainId: SupportedChain, poolIds: string[]) {
  let allData: GetPoolHourDatasQuery["poolHourDatas"] = [];
  let currentId = undefined;
  const maxRetries = 3;
  let counter = 0;

  while (true) {
    let retries = 0;
    let success = false;
    let poolHourDatas = [];

    while (retries < maxRetries && !success) {
      count++;
      try {
        const query: string = `{
                    poolHourDatas(first: 1000, orderBy: id, orderDirection: asc${
                      currentId
                        ? `, where: {id_gt: "${currentId}", pool_in: [${poolIds.map((id) => `"${id}"`).join(",")}]}`
                        : `, where: {pool_in: [${poolIds.map((id) => `"${id}"`).join(",")}]}`
                    }) {
                    id
                    token0Price
                    token1Price
                    periodStartUnix
                    sqrtPrice
                    liquidity
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
                }`;

        const results = await fetch(
          getSubgraphUrl(
            chainId === mainnet.id || isOpStack(chainId) ? "uniswap" : "algebra",
            chainId === mainnet.id || isOpStack(chainId) ? chainId : 100,
          )!,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          },
        );
        if (!results.ok) {
          throw new Error(`HTTP error! status: ${results.status}`);
        }

        const json = await results.json();
        if (json.errors?.length) {
          throw json.errors[0];
        }
        poolHourDatas = json?.data?.poolHourDatas ?? [];
        success = true;
        counter++;
      } catch (error) {
        retries++;

        if (retries === maxRetries) {
          throw new Error(`Max retries reached for id ${currentId}. ${error.message}`);
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retries));
      }
    }

    allData = allData.concat(poolHourDatas);

    // Break conditions
    if (
      poolHourDatas.length === 0 ||
      poolHourDatas[poolHourDatas.length - 1]?.pool?.id === currentId
    ) {
      break;
    }
    if (poolHourDatas.length < 1000) {
      break; // We've fetched all
    }

    currentId = poolHourDatas[poolHourDatas.length - 1]?.pool?.id;

    // wait 300ms between calls
    await new Promise((res) => setTimeout(res, 300));
  }
  return allData;
}
async function getSwapsByPoolIds(chainId: SupportedChain, poolIds: string[]) {
  let allData: GetSwapsQuery["swaps"] = [];
  let currentId = undefined;
  const maxRetries = 3;
  let counter = 0;

  while (true) {
    let retries = 0;
    let success = false;
    let swaps = [];

    while (retries < maxRetries && !success) {
      count++;
      try {
        const query: string = `{
                    swaps(first: 1000, orderBy: timestamp, orderDirection: asc${
                      currentId
                        ? `, where: {id_gt: "${currentId}", pool_in: [${poolIds.map((id) => `"${id}"`).join(",")}]}`
                        : `, where: {pool_in: [${poolIds.map((id) => `"${id}"`).join(",")}]}`
                    }) {
                    id
                    tick
                    timestamp
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
                }`;

        const results = await fetch(
          getSubgraphUrl(
            chainId === mainnet.id || isOpStack(chainId) ? "uniswap" : "algebra",
            chainId === mainnet.id || isOpStack(chainId) ? chainId : 100,
          )!,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          },
        );
        if (!results.ok) {
          throw new Error(`HTTP error! status: ${results.status}`);
        }

        const json = await results.json();
        if (json.errors?.length) {
          throw json.errors[0];
        }
        swaps = json?.data?.swaps ?? [];
        success = true;
        counter++;
      } catch (error) {
        retries++;

        if (retries === maxRetries) {
          throw new Error(`Max retries reached for id ${currentId}. ${error.message}`);
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retries));
      }
    }

    allData = allData.concat(swaps);

    // Break conditions
    if (swaps.length === 0 || swaps[swaps.length - 1]?.pool?.id === currentId) {
      break;
    }
    if (swaps.length < 1000) {
      break; // We've fetched all
    }

    currentId = swaps[swaps.length - 1]?.pool?.id;

    // wait 300ms between calls
    await new Promise((res) => setTimeout(res, 300));
  }
  return allData;
}

async function getSwapsByTokenPairsAsPoolHourDatas(
  chainId: SupportedChain,
  poolIds: string[],
): Promise<GetPoolHourDatasQuery["poolHourDatas"]> {
  try {
    const swaps = await getSwapsByPoolIds(chainId, poolIds);
    return swaps.map((swap) => {
      const [token1Price, token0Price] = tickToPrice(Number(swap.tick));
      return {
        token0Price,
        token1Price,
        periodStartUnix: Number(swap.timestamp),
        sqrtPrice: TickMath.getSqrtRatioAtTick(Number(swap.tick)).toString(),
        pool: swap.pool,
      };
    }) as GetPoolHourDatasQuery["poolHourDatas"];
  } catch (e) {
    return [];
  }
}

export async function getPoolHourDatas(chainId: SupportedChain, poolIds: string[]) {
  if (poolIds.length === 0) {
    return [];
  }
  const graphQLClient =
    chainId === gnosis.id ? swaprGraphQLClient(chainId, "algebra") : uniswapGraphQLClient(chainId);

  if (!graphQLClient) {
    throw new Error("Subgraph not available");
  }

  const BATCH_SIZE = 100;
  const batches = chunk(poolIds, BATCH_SIZE);

  const limit = pLimit(3);

  const batchResults = await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const [poolHourDatas, swaps] = await Promise.all([
          getPoolHourDatasByPoolIds(chainId, batch),
          getSwapsByTokenPairsAsPoolHourDatas(chainId, batch),
        ]);

        return poolHourDatas.concat(swaps).sort((a, b) => a.periodStartUnix - b.periodStartUnix);
      }),
    ),
  );
  console.log({ count });
  return batchResults.flat();
}
