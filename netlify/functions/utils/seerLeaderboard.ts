import { CHAIN_ID } from "@/utils/constants";

/**
 * The deep funding leaderboard, read from Seer.
 *
 * Seer materializes one board per deep contest (`app_id = "deepfund:<market id>"`) plus the summed
 * `deepfund` board, over the same wallets and the same markets this repo used to walk itself. Its
 * registry — `SEER_APPS.deepfund.markets` in `web/src/lib/apps.ts` — carries the same five ids and
 * labels as our `DEEP_CONTESTS`, so the mapping is nothing more than a prefix.
 *
 * We used to run that compute here too: a cron every 15 minutes, one Envio + Goldsky pass per
 * wallet, five blobs in `key_value`. Both jobs shared the same low subgraph budgets (Envio ~200
 * req/min, Goldsky 50 req/10 s) to produce the same numbers, and any fix Seer made had to be
 * ported before deep funding saw it. Reading their board instead removes the duplicate load and
 * makes upstream improvements land here for free.
 *
 * What stays ours is the *shape*: `sortBy`/`sortDir`, a search that does not renumber the board,
 * and `rankFor` over whichever column is being ranked. Seer's endpoint sorts by P/L only, so this
 * module pulls the whole board — 121 wallets globally, at most ~70 in a contest — and
 * `get-leaderboard.ts` sorts and slices it in memory, exactly as it did with the local blobs.
 */

/** Seer's app id for deep funding; a contest is a `:`-suffixed sub-id of it. */
const DEEPFUND_APP_ID = "deepfund";

/** Seer's cap. Every deep board fits in one page today; the loop below covers growth. */
const SEER_PAGE_SIZE = 200;

const SEER_API_HOST = process.env.SEER_API_HOST || "https://app.seer.pm";

export type LeaderboardPeriod = "1d" | "1w" | "1m" | "all";

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ["1d", "1w", "1m", "all"];

export function isLeaderboardPeriod(value: string): value is LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as string[]).includes(value);
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

/** One participant. Amounts are USD, which is what Seer materializes. */
export interface BoardRow {
  address: string;
  pnl: number;
  volume: number;
  roi: number | null;
  marketCount: number;
  /**
   * Every address this row aggregates, including its own. Seer already folds a participant's
   * trade-executor contracts into the EOA that owns them and reports the extras as
   * `mergedWallets`; keeping them here is what lets a search — or a "Your rank" from a connected
   * executor — still find the participant it was rolled into.
   */
  members: string[];
  /** When Seer last scored this wallet, ISO-8601. */
  updatedAt: string | null;
}

/**
 * Rank the board by one of the three columns the table shows.
 *
 * A null `roi` sinks to the bottom in *both* directions: it means the wallet deployed no
 * measurable capital, which is unknown rather than worst, and the column renders it as an
 * em-dash. Sorting it as -Infinity would put those rows at the top of an ascending board, which
 * reads as a ranking of the worst traders.
 *
 * Address tiebreak, so paging is stable across requests.
 */
export function sortRows(
  rows: BoardRow[],
  by: LeaderboardSort,
  dir: LeaderboardSortDir,
): BoardRow[] {
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

/** `global` is the whole of deep funding; anything else is a contest id from `@/utils/contests`. */
export function seerAppId(scope: string): string {
  return scope === "global" ? DEEPFUND_APP_ID : `${DEEPFUND_APP_ID}:${scope}`;
}

interface SeerApiRow {
  address: string;
  pnl: number;
  volume: number;
  roi: number | null;
  marketCount: number;
  updatedAt: string | null;
  mergedWallets?: string[];
}

interface SeerApiResult {
  total: number;
  rows: SeerApiRow[];
}

function toBoardRow(row: SeerApiRow): BoardRow {
  const address = String(row.address).toLowerCase();
  const merged = (row.mergedWallets ?? []).map((wallet) => wallet.toLowerCase());
  return {
    address,
    pnl: Number(row.pnl) || 0,
    volume: Number(row.volume) || 0,
    roi: row.roi === null || row.roi === undefined ? null : Number(row.roi),
    marketCount: Number(row.marketCount) || 0,
    members: [address, ...merged],
    updatedAt: row.updatedAt ?? null,
  };
}

async function fetchSeerPage(
  scope: string,
  period: LeaderboardPeriod,
  offset: number,
): Promise<SeerApiResult> {
  const params = new URLSearchParams({
    app: seerAppId(scope),
    // Seer defaults this to Gnosis; deep funding is entirely on Optimism, so it is never optional.
    chainId: String(CHAIN_ID),
    period,
    limit: String(SEER_PAGE_SIZE),
    offset: String(offset),
  });
  const url = `${SEER_API_HOST}/.netlify/functions/get-pnl-leaderboard?${params}`;

  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as Partial<SeerApiResult> & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? `Seer leaderboard request failed (${response.status})`);
  }
  return { total: Number(body.total) || 0, rows: body.rows ?? [] };
}

/**
 * The whole board for one scope, in Seer's P/L order.
 *
 * `search` is deliberately *not* forwarded. Seer renumbers `rank` over the filtered set; here a
 * search filters the board without renumbering it, so the filtering has to happen after ranking —
 * see `paginate` in `get-leaderboard.ts`.
 *
 * `updatedAt` is the *oldest* row, not Seer's envelope value. Seer reports the newest row on the
 * page, which is the last time the refresh wrote anything; a board is only as fresh as its worst
 * row, and that is what the UI's "updated" line has always meant.
 */
export async function fetchSeerBoard(
  scope: string,
  period: LeaderboardPeriod,
): Promise<{ rows: BoardRow[]; updatedAt: string | null }> {
  const rows: BoardRow[] = [];
  let total = 0;

  for (let offset = 0; ; offset += SEER_PAGE_SIZE) {
    const page = await fetchSeerPage(scope, period, offset);
    total = page.total;
    rows.push(...page.rows.map(toBoardRow));
    if (page.rows.length === 0 || rows.length >= total) break;
  }

  let oldest: string | null = null;
  for (const row of rows) {
    // Both sides are ISO-8601, so lexical order is chronological order.
    if (row.updatedAt && (oldest === null || row.updatedAt < oldest)) oldest = row.updatedAt;
  }

  return { rows, updatedAt: oldest };
}
