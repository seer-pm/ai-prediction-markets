import { PoolHourDatasSets } from "@/types";
import { CHAIN_ID } from "@/utils/constants";
import type { SupportedChain } from "@seer-pm/sdk";
import {
  Token0Token1,
  getSubgraphUrl,
  isOpStack,
  swaprGraphQLClient,
  tickToPrice,
  uniswapGraphQLClient,
} from "@seer-pm/sdk";
import { GetPoolHourDatasQuery, GetSwapsQuery } from "@seer-pm/sdk/subgraph/swapr";
import { TickMath } from "@uniswap/v3-sdk";
import pLimit from "p-limit";
import { gnosis, mainnet } from "viem/chains";

export async function getChartData(
  poolsPairs: Token0Token1[],
  firstTimestamp: number,
): Promise<PoolHourDatasSets> {
  try {
    return await getPoolHourDatas(poolsPairs, CHAIN_ID, firstTimestamp);
  } catch (e) {
    console.log("Error getting chart");
    console.log(e);
    return [];
  }
}

async function getPoolHourDatasByTokenPair(
  chainId: SupportedChain,
  tokenPair: Token0Token1,
  initialStartTime: number,
) {
  let allData: GetPoolHourDatasQuery["poolHourDatas"] = [];
  let currentPeriodStartUnix = initialStartTime;

  const maxRetries = 3;
  let counter = 0;

  while (true) {
    let retries = 0;
    let success = false;
    let poolHourDatas = [];

    while (retries < maxRetries && !success) {
      try {
        const query = `{
                    poolHourDatas(first: 1000, orderBy: periodStartUnix, orderDirection: asc${
                      currentPeriodStartUnix
                        ? `, where: {periodStartUnix_gt: ${currentPeriodStartUnix}, pool_: {token0: "${tokenPair.token0}", token1: "${tokenPair.token1}"}}`
                        : `, where: {pool_: {token0: "${tokenPair.token0}", token1: "${tokenPair.token1}"}}`
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
          throw new Error(
            `Max retries reached for periodStartUnix ${currentPeriodStartUnix}. ${error.message}`,
          );
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retries));
      }
    }

    allData = allData.concat(poolHourDatas);

    // Break conditions
    if (
      poolHourDatas.length === 0 ||
      poolHourDatas[poolHourDatas.length - 1]?.periodStartUnix === currentPeriodStartUnix
    ) {
      break;
    }
    if (poolHourDatas.length < 1000) {
      break; // We've fetched all
    }

    currentPeriodStartUnix = poolHourDatas[poolHourDatas.length - 1]?.periodStartUnix;

    // wait 300ms between calls
    await new Promise((res) => setTimeout(res, 300));
  }
  return allData;
}
async function getSwapsByTokenPair(
  chainId: SupportedChain,
  tokenPair: Token0Token1,
  initialStartTime: number,
) {
  let allData: GetSwapsQuery["swaps"] = [];
  let currentTimestamp = initialStartTime;

  const maxRetries = 3;
  let counter = 0;

  while (true) {
    let retries = 0;
    let success = false;
    let swaps = [];

    while (retries < maxRetries && !success) {
      try {
        const query = `{
                    swaps(first: 1000, orderBy: timestamp, orderDirection: asc${
                      currentTimestamp
                        ? `, where: {timestamp_gt: ${currentTimestamp}, pool_: {token0: "${tokenPair.token0}", token1: "${tokenPair.token1}"}}`
                        : `, where: {pool_: {token0: "${tokenPair.token0}", token1: "${tokenPair.token1}"}}`
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
          throw new Error(
            `Max retries reached for timestamp ${currentTimestamp}. ${error.message}`,
          );
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retries));
      }
    }

    allData = allData.concat(swaps);

    // Break conditions
    if (swaps.length === 0 || swaps[swaps.length - 1]?.timestamp === currentTimestamp) {
      break;
    }
    if (swaps.length < 1000) {
      break; // We've fetched all
    }

    currentTimestamp = swaps[swaps.length - 1]?.timestamp;

    // wait 300ms between calls
    await new Promise((res) => setTimeout(res, 300));
  }
  return allData;
}

async function getSwapsByTokenAsPoolHourDatas(
  chainId: SupportedChain,
  poolPairs: Token0Token1,
  initialStartTime: number,
): Promise<GetPoolHourDatasQuery["poolHourDatas"]> {
  try {
    const swaps = await getSwapsByTokenPair(chainId, poolPairs, initialStartTime);
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

export async function getPoolHourDatas(
  poolsPairs: Token0Token1[],
  chainId: SupportedChain,
  startTime: number,
) {
  if (poolsPairs.length === 0) {
    return [];
  }
  const graphQLClient =
    chainId === gnosis.id ? swaprGraphQLClient(chainId, "algebra") : uniswapGraphQLClient(chainId);

  if (!graphQLClient) {
    throw new Error("Subgraph not available");
  }
  const limit = pLimit(30);

  return await Promise.all(
    poolsPairs.map((poolPairs, index) =>
      limit(async () => {
        const start = startTime;
        const [poolHourDatas, swaps] = await Promise.all([
          getPoolHourDatasByTokenPair(chainId, poolPairs, start),
          getSwapsByTokenAsPoolHourDatas(chainId, poolPairs, start),
        ]);

        return poolHourDatas.concat(swaps).sort((a, b) => a.periodStartUnix - b.periodStartUnix);
      }),
    ),
  );
}
