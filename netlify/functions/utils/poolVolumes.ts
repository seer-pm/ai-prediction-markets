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
  /** Summed `txCount` of the pair's pools: how many pool events the reading had seen. */
  txCount: number;
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
      txCount
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
  /** Events the indexer has applied to this pool. Only ever rises, so the larger one is fresher. */
  txCount: string;
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
 * indexer omits rows, it does not invent them.
 *
 * Omitting rows is not the only failure. One indexer behind the gateway returns rows that are there
 * but wrong: it reports the same head block as the others while missing dozens of events per pool,
 * so an L1 pool emptied weeks ago read 21 sUSDS locked (txCount 55) against the 0.006 actually on
 * chain (txCount 131). It answered about one read in three, and letting the last read win made both
 * liquidity and volume change with every run. A pool's `txCount` only ever rises, so when two reads
 * disagree the larger one is the fresher answer.
 *
 * Choosing between answers needs both indexers to have been seen, and an agreeing run proves nothing,
 * since two bad reads agree too. So reading stops early only after a disagreement has turned up and a
 * later read added nothing to it.
 *
 * Retries cannot be the whole defence, though. The gateway hands the bad indexer out in windows, not
 * at random per read: 80 back-to-back reads have all come from one indexer, and so has an entire run
 * of five. What actually holds the stored figure is `isStaleReading`, which refuses to overwrite a
 * reading with one that has seen fewer pool events. Three reads is enough to catch the common case.
 */
const BATCH_ATTEMPTS = 3;

const txCountOf = (pool: PoolVolumeRow) => BigInt(pool.txCount || "0");

/**
 * One batch, read until both indexers have been seen and a further read changes nothing.
 *
 * Deduped by pool id *before* anything is summed: unioning raw rows would count a pool's volume once
 * per read that returned it. Of a pool's duplicate rows, the one with the highest `txCount` is kept.
 */
async function readPoolBatch(batch: string[]): Promise<PoolVolumeRow[]> {
  const pools = new Map<string, PoolVolumeRow>();
  let disagreed = false;

  for (let attempt = 0; attempt < BATCH_ATTEMPTS; attempt++) {
    let changed = false;
    try {
      const { data } = await UniswapGraphQLClient.query<{ pools: PoolVolumeRow[] }>({
        query: GetPoolVolumesDocument,
        variables: { first: 1000, where: { id_in: batch } },
        // The point of this module is to answer "now"; Apollo's default cache would hand a warm
        // lambda the same totals it returned on the previous invocation.
        fetchPolicy: "no-cache",
      });
      const rows = data?.pools ?? [];
      // A short answer after the first read is a disagreement too, even if every row it did return matches.
      if (attempt > 0 && rows.length !== pools.size) disagreed = true;
      for (const pool of rows) {
        const id = pool.id.toLowerCase();
        const seen = pools.get(id);
        if (!seen || txCountOf(pool) > txCountOf(seen)) {
          if (seen || attempt > 0) {
            changed = true;
            disagreed = true;
          }
          pools.set(id, pool);
        } else if (txCountOf(pool) < txCountOf(seen)) {
          disagreed = true;
        }
      }
    } catch (e) {
      // A thrown read is just another short one; keep whatever the other attempts found.
      console.log("pool volume batch read failed", (e as Error)?.message);
    }
    // Settled: a disagreement has been seen, so both answers are in hand, and this read moved nothing.
    if (attempt > 0 && disagreed && !changed) break;
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
        txCount: 0,
      };
      current.txCount += Number(pool.txCount) || 0;
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
  /**
   * Pool events behind these figures, summed over the market's pools. Stored with them as
   * `poolTxCount` so a later reading can be checked against it — see `isStaleReading`.
   */
  txCount: number;
};

/**
 * True when a new reading has seen fewer pool events than the one already stored, and so must not
 * replace it.
 *
 * `txCount` only ever rises, so a lower sum cannot be a newer view of the same pools: it is an
 * indexer that is missing events (see `BATCH_ATTEMPTS`), or a read that came back short. Either way
 * its volume undercounts and its liquidity can be weeks old. A blob with no `poolTxCount` yet —
 * written before it was stored — accepts anything, and the first reading sets the bar.
 */
export function isStaleReading(stored: unknown, txCount: number): boolean {
  const prior = (stored as { poolTxCount?: unknown } | undefined)?.poolTxCount;
  return typeof prior === "number" && txCount < prior;
}

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
    txCount: 0,
  };

  for (const token of tokens) {
    const pool = volumeIndex.get(poolPairKey(token, collateral));
    if (!pool) continue;
    const collateralIsToken0 = isTwoStringsEqual(collateral, pool.token0);
    totals.volume.collateral += collateralIsToken0 ? pool.totalVolume0 : pool.totalVolume1;
    totals.volume.tokens += collateralIsToken0 ? pool.totalVolume1 : pool.totalVolume0;
    totals.liquidity.collateral += collateralIsToken0 ? pool.totalLocked0 : pool.totalLocked1;
    totals.liquidity.tokens += collateralIsToken0 ? pool.totalLocked1 : pool.totalLocked0;
    totals.txCount += pool.txCount;
    if (!totals.matched) {
      totals.collateralName = collateralIsToken0 ? pool.token0Name : pool.token1Name;
      totals.matched = true;
    }
  }

  return totals;
}
