import { CHAIN_ID } from "@/utils/constants";
import { DEEP_CONTESTS, type Contest } from "@/utils/contests";
import { createClient } from "@supabase/supabase-js";
import type { Address } from "viem";
import { canonicalAddress, type OwnerMap } from "./executorOwners";
import type { PortfolioPlPeriod } from "./pnl/seerIndexerPortfolio";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export const LEADERBOARD_PERIODS: PortfolioPlPeriod[] = ["1d", "1w", "1m", "all"];

export function isLeaderboardPeriod(value: string): value is PortfolioPlPeriod {
  return (LEADERBOARD_PERIODS as string[]).includes(value);
}

/** One row per wallet per contest per period. Amounts are sUSDS, not USD. */
export interface LeaderboardRow {
  address: string;
  pnl: number;
  volume: number;
  roi: number | null;
  marketCount: number;
  /**
   * Kept so ROI can be recomputed after aggregation (e.g. summing contests) without
   * re-running the compute — `roi` itself is not additive.
   */
  valueStart: number;
  tradingCollateralNetOut: number;
  /**
   * The markets behind `marketCount`. Kept so merging a participant's wallets unions the
   * markets instead of adding the counts — two wallets that traded the same market are one
   * market, and adding them produced counts larger than the contest itself.
   *
   * Absent on rows that predate this field and on Seer's `pnl_leaderboard`, which stores only
   * the count; `mergeMarketCount` falls back to summing there.
   */
  marketIds?: string[];
  /**
   * When the refresh job actually scored this wallet, ISO-8601.
   *
   * A run re-scores a handful of wallets and rewrites the whole blob, so the blob's `updatedAt`
   * describes the last *write*, not the last *compute* — it reads as seconds old while most rows
   * are hours old. `oldestComputedAt` uses this to report what the board is really worth.
   *
   * Absent on rows written before this field existed and on Seer's `pnl_leaderboard`.
   */
  computedAt?: string;
}

/** Union the markets when every row knows them; otherwise sum, which is all we can do. */
function mergeMarketCount(rows: Pick<LeaderboardRow, "marketCount" | "marketIds">[]): {
  marketCount: number;
  marketIds?: string[];
} {
  if (rows.every((row) => row.marketIds)) {
    const union = new Set(rows.flatMap((row) => row.marketIds ?? []));
    return { marketCount: union.size, marketIds: [...union] };
  }
  return { marketCount: rows.reduce((total, row) => total + row.marketCount, 0) };
}

export interface ContestLeaderboard {
  updatedAt: string;
  rowsByPeriod: Record<PortfolioPlPeriod, LeaderboardRow[]>;
}

/**
 * Where a contest's rows live. `key_value` is the same table the chart cache uses
 * (`get-charts-background.ts`); at ~50 rows per contest a dedicated table would only add a
 * hand-applied migration — this repo has no migration runner.
 */
export function leaderboardKey(contestId: string): string {
  return `deep_pm_leaderboard_${contestId}_${CHAIN_ID}`;
}

export const LEADERBOARD_CURSOR_KEY = `deep_pm_leaderboard_cursor_${CHAIN_ID}`;

/** Capital dust (sUSDS) below which ROI is undefined. */
export const ROI_CAPITAL_DUST = 0.01;

/**
 * Deployed capital for ROI: `valueStart + buys`.
 *
 * Buys (primary collateral spent as `tokenIn`) is recovered from the two swap aggregates:
 *   volume = primary_in + primary_out
 *   tradingCollateralNetOut = primary_in − primary_out
 *   ⇒ buys = (volume + tradingCollateralNetOut) / 2
 *
 * `max(buys, 0)` rather than `max(netOut, 0)` — a round-trip or net-seller wallet with real
 * PnL and volume would otherwise get capital 0 and an undefined ROI. Mirrors
 * `capitalUsdFromRow` in Seer's `utils/pnlLeaderboard.ts`, in sUSDS instead of USD.
 */
export function capitalFromRow(args: {
  valueStart: number;
  volume: number;
  tradingCollateralNetOut: number;
}): number {
  const buys = ((Number(args.volume) || 0) + (Number(args.tradingCollateralNetOut) || 0)) / 2;
  return (Number(args.valueStart) || 0) + Math.max(buys, 0);
}

/** `pnl / capital`, or null when capital is dust (avoids ÷0 and "infinite" ROI). */
export function computeRoi(args: {
  pnl: number;
  valueStart: number;
  volume: number;
  tradingCollateralNetOut: number;
}): number | null {
  const capital = capitalFromRow(args);
  if (capital < ROI_CAPITAL_DUST) return null;
  return args.pnl / capital;
}

export type LeaderboardSort = "pnl" | "volume" | "roi";
export type LeaderboardSortDir = "desc" | "asc";

export const LEADERBOARD_SORTS: LeaderboardSort[] = ["pnl", "volume", "roi"];

export function isLeaderboardSort(value: string): value is LeaderboardSort {
  return (LEADERBOARD_SORTS as string[]).includes(value);
}

export function isLeaderboardSortDir(value: string): value is LeaderboardSortDir {
  return value === "desc" || value === "asc";
}

/**
 * Rank the board by one of the three columns the table shows.
 *
 * A null `roi` (the `ROI_CAPITAL_DUST` guard) sinks to the bottom in *both* directions: it means
 * the wallet deployed no measurable capital, which is unknown rather than worst, and the column
 * renders it as an em-dash. Sorting it as -Infinity would put those rows at the top of an
 * ascending board, which reads as a ranking of the worst traders.
 *
 * Same address tiebreak as before, so paging is stable across requests.
 */
export function sortRows(
  rows: RolledUpRow[],
  by: LeaderboardSort,
  dir: LeaderboardSortDir,
): RolledUpRow[] {
  const sign = dir === "asc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (by === "roi") {
      if (a.roi === null && b.roi === null) return a.address.localeCompare(b.address);
      if (a.roi === null) return 1;
      if (b.roi === null) return -1;
      return sign * (b.roi - a.roi) || a.address.localeCompare(b.address);
    }
    return sign * (b[by] - a[by]) || a.address.localeCompare(b.address);
  });
}

/** A ranked row plus the addresses that were merged into it. */
export interface RolledUpRow extends LeaderboardRow {
  /** Every address this row aggregates, including its own. Used so a search for an executor
   * address still finds the participant it was rolled into. */
  members: string[];
}

/**
 * Collapse rows that belong to the same participant, then re-rank.
 *
 * A person can hold positions under a CREATE2 `TradeExecutor` and under their own
 * 7702-delegated EOA; ranked separately they are two competitors. Every component is additive
 * across their wallets, so the sums are exact and ROI is recomputed from the summed capital
 * rather than averaged.
 *
 * `marketCount` is the one approximation: distinct-market identity is not retained per row, so
 * a market traded from both wallets counts twice. Rare in practice (people use one wallet at a
 * time) and the same simplification Seer makes when summing across chains.
 */
export function rollUpRows(rows: LeaderboardRow[], owners: OwnerMap): RolledUpRow[] {
  const groups = new Map<string, LeaderboardRow[]>();
  for (const row of rows) {
    const canonical = canonicalAddress(row.address, owners);
    if (!groups.has(canonical)) groups.set(canonical, []);
    groups.get(canonical)!.push({ ...row, address: row.address.toLowerCase() });
  }

  return [...groups.entries()]
    .map(([address, group]) => {
      const merged: RolledUpRow = {
        address,
        pnl: group.reduce((total, row) => total + row.pnl, 0),
        volume: group.reduce((total, row) => total + row.volume, 0),
        valueStart: group.reduce((total, row) => total + row.valueStart, 0),
        tradingCollateralNetOut: group.reduce((total, row) => total + row.tradingCollateralNetOut, 0),
        ...mergeMarketCount(group),
        roi: null,
        members: group.map((row) => row.address),
      };
      return { ...merged, roi: computeRoi(merged) };
    })
    .sort((a, b) => b.pnl - a.pnl || a.address.localeCompare(b.address));
}

/**
 * A contest's parent market plus every child.
 *
 * The registry lists parents (they are what the tabs are about) but trading happens on the
 * conditionals underneath, so PnL scoped to the parent alone would be nearly empty. Same
 * expansion as `expandMarketIdsWithChildren` in Seer's leaderboard job.
 */
export async function expandContestMarketIds(contest: Contest): Promise<Address[]> {
  const parent = contest.marketId.toLowerCase();
  const { data, error } = await supabase
    .from("markets")
    .select("id")
    .eq("chain_id", CHAIN_ID)
    .eq("subgraph_data->parentMarket->>id", parent);
  if (error) throw error;

  const ids = new Set<string>([parent]);
  for (const row of data ?? []) {
    ids.add(String(row.id).toLowerCase());
  }
  return [...ids] as Address[];
}

const CANDIDATE_PAGE_SIZE = 1000;

/**
 * Every wallet the indexer has seen touching this contest's markets.
 *
 * `analytics_daily_wallet_market` is populated outside both repos; nothing here writes it.
 * Unlike Seer's job there is no recent-activity cutoff — four of five contests have ended, so
 * a window would rank nobody in them.
 */
export async function listContestCandidates(marketIds: Address[]): Promise<string[]> {
  if (marketIds.length === 0) return [];

  const addresses = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("analytics_daily_wallet_market")
      .select("address")
      .eq("chain_id", CHAIN_ID)
      .in("market_id", marketIds)
      .range(offset, offset + CANDIDATE_PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      if (row.address) addresses.add(String(row.address).toLowerCase());
    }
    if (rows.length < CANDIDATE_PAGE_SIZE) break;
    offset += CANDIDATE_PAGE_SIZE;
  }
  // Stable order so the refresh cursor means the same thing between runs.
  return [...addresses].sort();
}

/**
 * Add each candidate's trade-executor contracts to the list.
 *
 * `analytics_daily_wallet_market` is keyed by the account that sent the transaction, so an
 * executor never appears there — but it is the address that actually holds the outcome tokens.
 * Scoring only the EOAs drops that value entirely. The rows are merged back into the owner at
 * read time by `rollUpRows`.
 */
export function withExecutors(candidates: string[], owners: OwnerMap): string[] {
  const set = new Set(candidates.map((address) => address.toLowerCase()));
  for (const [executor, owner] of Object.entries(owners)) {
    if (set.has(owner)) set.add(executor);
  }
  return [...set].sort();
}

/**
 * Every address either board can show: the union of all contest candidates and the wallets on
 * Seer's `deepfund` board. The second half matters because the global scope is rolled up too,
 * and its rows come from a table we do not populate.
 */
export async function listAllLeaderboardAddresses(): Promise<string[]> {
  const addresses = new Set<string>();

  for (const contest of DEEP_CONTESTS) {
    const marketIds = await expandContestMarketIds(contest);
    for (const address of await listContestCandidates(marketIds)) {
      addresses.add(address);
    }
  }

  const { data, error } = await supabase
    .from("pnl_leaderboard")
    .select("address")
    .eq("app_id", "deepfund")
    .eq("chain_id", CHAIN_ID)
    .eq("period", "all");
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.address) addresses.add(String(row.address).toLowerCase());
  }

  return [...addresses];
}

/** Every contest's stored board, in `DEEP_CONTESTS` order. */
export async function readAllContestLeaderboards(): Promise<ContestLeaderboard[]> {
  return Promise.all(DEEP_CONTESTS.map((contest) => readContestLeaderboard(contest.id)));
}

/**
 * Sum our per-contest rows for one period, per address.
 *
 * Contests are disjoint market sets that together are the whole of deep funding, and every
 * component is additive, so this reproduces an all-markets board from the per-contest ones —
 * which is what the global scope serves.
 *
 * Takes the boards rather than reading them so the caller can also derive `oldestComputedAt`
 * from the same five reads.
 */
export function sumContestRows(
  boards: ContestLeaderboard[],
  period: PortfolioPlPeriod,
): LeaderboardRow[] {
  const groups = new Map<string, LeaderboardRow[]>();

  for (const board of boards) {
    for (const row of board.rowsByPeriod[period] ?? []) {
      if (!groups.has(row.address)) groups.set(row.address, []);
      groups.get(row.address)!.push(row);
    }
  }

  return [...groups.entries()].map(([address, group]) => {
    const merged: LeaderboardRow = {
      address,
      pnl: group.reduce((total, row) => total + row.pnl, 0),
      volume: group.reduce((total, row) => total + row.volume, 0),
      valueStart: group.reduce((total, row) => total + row.valueStart, 0),
      tradingCollateralNetOut: group.reduce((total, row) => total + row.tradingCollateralNetOut, 0),
      ...mergeMarketCount(group),
      roi: null,
    };
    return { ...merged, roi: computeRoi(merged) };
  });
}

/**
 * How stale the *oldest* row on these boards is — what "updated" should say in the UI.
 *
 * A run re-scores a few wallets and rewrites the whole blob, so `updatedAt` claims the board is
 * seconds old when a full lap takes hours. The board is only as fresh as its worst row.
 *
 * Rows predating `computedAt` fall back to their blob's `updatedAt`, which is the most we know
 * about them. Returns null when there is nothing scored at all.
 */
export function oldestComputedAt(
  boards: ContestLeaderboard[],
  period: PortfolioPlPeriod,
): string | null {
  let oldest: string | null = null;
  for (const board of boards) {
    for (const row of board.rowsByPeriod[period] ?? []) {
      // Both are `toISOString()`, so lexical order is chronological order.
      const at = row.computedAt ?? board.updatedAt;
      if (at && (oldest === null || at < oldest)) oldest = at;
    }
  }
  return oldest;
}

function emptyLeaderboard(): ContestLeaderboard {
  return {
    updatedAt: new Date(0).toISOString(),
    rowsByPeriod: { "1d": [], "1w": [], "1m": [], all: [] },
  };
}

export async function readContestLeaderboard(contestId: string): Promise<ContestLeaderboard> {
  const { data, error } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", leaderboardKey(contestId))
    .maybeSingle();
  if (error) throw error;
  const value = data?.value as ContestLeaderboard | undefined;
  if (!value?.rowsByPeriod) return emptyLeaderboard();
  return value;
}

export async function writeContestLeaderboard(
  contestId: string,
  leaderboard: ContestLeaderboard,
): Promise<void> {
  const { error } = await supabase
    .from("key_value")
    .upsert({ key: leaderboardKey(contestId), value: leaderboard }, { onConflict: "key" });
  if (error) throw error;
}

/**
 * Merge freshly computed rows into a stored leaderboard, replacing by address.
 *
 * A run that exhausts its time budget still improves coverage rather than truncating the
 * board to whatever it managed this time.
 */
export function mergeRows(
  existing: ContestLeaderboard,
  computed: Map<string, Record<PortfolioPlPeriod, LeaderboardRow>>,
): ContestLeaderboard {
  const rowsByPeriod = { ...existing.rowsByPeriod };
  for (const period of LEADERBOARD_PERIODS) {
    const byAddress = new Map<string, LeaderboardRow>();
    for (const row of existing.rowsByPeriod[period] ?? []) {
      byAddress.set(row.address, row);
    }
    for (const [address, perPeriod] of computed) {
      byAddress.set(address, perPeriod[period]);
    }
    rowsByPeriod[period] = [...byAddress.values()].sort(
      (a, b) => b.pnl - a.pnl || a.address.localeCompare(b.address),
    );
  }
  return { updatedAt: new Date().toISOString(), rowsByPeriod };
}

export interface RefreshCursor {
  /** Index into `DEEP_CONTESTS` of the contest to resume with. */
  contestIndex: number;
  /** Index into that contest's sorted candidate list. */
  walletIndex: number;
}

export async function readRefreshCursor(): Promise<RefreshCursor> {
  const { data, error } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", LEADERBOARD_CURSOR_KEY)
    .maybeSingle();
  if (error) throw error;
  const value = data?.value as Partial<RefreshCursor> | undefined;
  const contestIndex = Number(value?.contestIndex);
  const walletIndex = Number(value?.walletIndex);
  return {
    contestIndex:
      Number.isInteger(contestIndex) && contestIndex >= 0 && contestIndex < DEEP_CONTESTS.length
        ? contestIndex
        : 0,
    walletIndex: Number.isInteger(walletIndex) && walletIndex >= 0 ? walletIndex : 0,
  };
}

export async function writeRefreshCursor(cursor: RefreshCursor): Promise<void> {
  const { error } = await supabase
    .from("key_value")
    .upsert({ key: LEADERBOARD_CURSOR_KEY, value: cursor }, { onConflict: "key" });
  if (error) throw error;
}
