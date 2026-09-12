import { UniswapGraphQLClient } from "@/config/apollo";
import { getToken0Token1, isTwoStringsEqual } from "@/utils/common";
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
 *
 * The same rows carry `totalValueLockedToken0`/`1`, so current liquidity is read alongside volume for
 * no extra request — and, riding the same sweep, it is refreshed by the same button and can never
 * disagree with the volume printed next to it.
 */

/** Aggregated over every pool of the pair: a token can trade against the collateral at several fee tiers. */
export type PoolVolumeData = {
  token0: Address;
  token1: Address;
  token0Name: string;
  token1Name: string;
  totalVolume0: number;
  totalVolume1: number;
  /**
   * What is sitting in the pools *right now*, per leg — `totalValueLockedToken0`/`1`, which are the
   * pools' actual token balances rather than a running total. Unlike volume these can fall, and a
   * pool whose LP has withdrawn reads zero, which is the correct answer and not a failed read.
   */
  totalLocked0: number;
  totalLocked1: number;
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
      liquidity
      volumeToken0
      volumeToken1
      totalValueLockedToken0
      totalValueLockedToken1
      token0 { id name }
      token1 { id name }
    }
  }
`);

type PoolVolumeRow = {
  id: string;
  liquidity: string;
  volumeToken0: string;
  volumeToken1: string;
  totalValueLockedToken0: string;
  totalValueLockedToken1: string;
  token0: { id: string; name: string };
  token1: { id: string; name: string };
};

/** Pool ids per query. Matches the chart job's batch size for the same subgraph. */
const BATCH_SIZE = 100;

/**
 * Reads per batch before the answer is accepted.
 *
 * The gateway fans this deployment out across indexers and they do not agree. The same query for the
 * same 100 ids in the same process returns 100 pools, then 10, then 100 — and the short answers come
 * back with a plausible `_meta.block.number` a few blocks behind and `hasIndexingErrors: false`, so
 * nothing marks them partial and `data?.pools ?? []` accepts them whole. A single read is a coin
 * flip on how much of the market set you see, which silently undercounts volume and would badly
 * mislead anything using this to decide which pools still exist.
 *
 * Reading a batch more than once and unioning by pool id converges on the fullest answer: a lagging
 * indexer omits rows, it does not invent them. Two reads is the floor for noticing a disagreement at
 * all; the third is only paid when the second one still moved.
 */
const BATCH_ATTEMPTS = 3;

/**
 * One batch, read until two consecutive reads stop adding pools.
 *
 * Deduped by pool id *before* anything is summed: unioning raw rows would count a pool's volume once
 * per read that returned it.
 */
async function readPoolBatch(batch: string[]): Promise<PoolVolumeRow[]> {
  const pools = new Map<string, PoolVolumeRow>();

  for (let attempt = 0; attempt < BATCH_ATTEMPTS; attempt++) {
    const before = pools.size;
    try {
      const { data } = await UniswapGraphQLClient.query<{ pools: PoolVolumeRow[] }>({
        query: GetPoolVolumesDocument,
        variables: { first: 1000, where: { id_in: batch } },
        // The point of this module is to answer "now"; Apollo's default cache would hand a warm
        // lambda the same totals it returned on the previous invocation.
        fetchPolicy: "no-cache",
      });
      for (const pool of data?.pools ?? []) pools.set(pool.id.toLowerCase(), pool);
    } catch (e) {
      // A thrown read is just another short one; keep whatever the other attempts found.
      console.log("pool volume batch read failed", (e as Error)?.message);
    }
    // Settled: this read agreed with every read before it. One read can never establish that.
    if (attempt > 0 && pools.size === before) break;
  }

  return [...pools.values()];
}

/**
 * What one sweep of the pool entities learned.
 *
 * `byPair` is the volume index the writers sum from. The id lists are a by-product: the sweep visits
 * every pool anyway, so reporting which exist and which have been emptied costs nothing — and
 * because it is unioned over repeated reads, it is the only reading of that in this job which is
 * safe to act on.
 */
export type PoolVolumeSweep = {
  byPair: Map<string, PoolVolumeData>;
  /**
   * Ids that resolved to a real pool — not every id asked for. `deep_pm_pool_ids` is maintained
   * outside this repo and carries ids that never became pools.
   */
  realPoolIds: string[];
  /** A subset of `realPoolIds`: pools at zero liquidity, whose candle history can no longer change. */
  drainedPoolIds: string[];
};

export async function getPoolVolumes(poolIds: string[]): Promise<PoolVolumeSweep> {
  const index = new Map<string, PoolVolumeData>();
  const realPoolIds: string[] = [];
  const drainedPoolIds: string[] = [];
  const ids = [...new Set(poolIds.map((id) => id.toLowerCase()))];

  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);

    for (const pool of await readPoolBatch(batch)) {
      realPoolIds.push(pool.id.toLowerCase());
      if (BigInt(pool.liquidity || "0") === 0n) drainedPoolIds.push(pool.id.toLowerCase());
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
        totalLocked0: 0,
        totalLocked1: 0,
      };
      current.totalVolume0 += Number(pool.volumeToken0) || 0;
      current.totalVolume1 += Number(pool.volumeToken1) || 0;
      // Summed across the pair's pools for the same reason volume is: one token can trade against the
      // collateral at more than one fee tier, and the depth behind a price is all of them.
      current.totalLocked0 += Number(pool.totalValueLockedToken0) || 0;
      current.totalLocked1 += Number(pool.totalValueLockedToken1) || 0;
      index.set(key, current);
    }
  }

  return { byPair: index, realPoolIds, drainedPoolIds };
}

/**
 * A figure counted on both legs of a pool.
 *
 * A pool holds and moves two tokens, so the same quantity can be read either as the collateral it
 * amounts to or as the outcome tokens it amounts to. They are not interchangeable — at a price of
 * 0.02 the token count is fifty times the cash — so both are stored, and the tabs show the cash
 * figure with the token count on hover.
 */
export type PoolLegs = {
  /** The collateral leg — the money side, in the market's own collateral. */
  collateral: number;
  /** The outcome-token leg, summed over the market's outcomes. */
  tokens: number;
};

/**
 * One market's pool figures: all-time volume, and what is in the pools now.
 *
 * The two come from the same sweep and differ in kind. Volume is a running total that only ever
 * rises; liquidity is an instantaneous balance that falls when an LP withdraws and is zero for a pool
 * that has been emptied.
 */
export type MarketTotals = {
  /** All-time swap volume: what has been paid and received, and how many shares moved. */
  volume: PoolLegs;
  /** Current depth: the collateral and the outcome tokens sitting in the pools at this instant. */
  liquidity: PoolLegs;
  /** The collateral's *name* as the subgraph spells it ("Savings USDS"), not its symbol. */
  collateralName: string;
  /** False when no pool of this market was in the index: the totals are zeros, not a reading. */
  matched: boolean;
};

/**
 * Sums a market's pools, which is one pool per outcome token against the market's collateral: the
 * primary token on a flat market, the parent's outcome token on a conditional one.
 */
export function sumMarketTotals(
  volumeIndex: Map<string, PoolVolumeData>,
  tokens: Address[],
  collateral: Address,
): MarketTotals {
  const totals: MarketTotals = {
    volume: { collateral: 0, tokens: 0 },
    liquidity: { collateral: 0, tokens: 0 },
    collateralName: "",
    matched: false,
  };

  for (const token of tokens) {
    const pool = volumeIndex.get(poolPairKey(token, collateral));
    if (!pool) continue;
    const collateralIsToken0 = isTwoStringsEqual(collateral, pool.token0);
    totals.volume.collateral += collateralIsToken0 ? pool.totalVolume0 : pool.totalVolume1;
    totals.volume.tokens += collateralIsToken0 ? pool.totalVolume1 : pool.totalVolume0;
    totals.liquidity.collateral += collateralIsToken0 ? pool.totalLocked0 : pool.totalLocked1;
    totals.liquidity.tokens += collateralIsToken0 ? pool.totalLocked1 : pool.totalLocked0;
    if (!totals.matched) {
      totals.collateralName = collateralIsToken0 ? pool.token0Name : pool.token1Name;
      totals.matched = true;
    }
  }

  return totals;
}
