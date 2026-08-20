import { CHAIN_ID } from "@/utils/constants";
import { isContestId } from "@/utils/contests";
import { createClient } from "@supabase/supabase-js";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap, type OwnerMap } from "./utils/executorOwners";
import {
  type LeaderboardRow,
  type RolledUpRow,
  isLeaderboardPeriod,
  isLeaderboardSort,
  isLeaderboardSortDir,
  oldestComputedAt,
  readAllContestLeaderboards,
  readContestLeaderboard,
  rollUpRows,
  sortRows,
  sumContestRows,
} from "./utils/leaderboard";
import type { PortfolioPlPeriod } from "./utils/pnl/seerIndexerPortfolio";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * P/L leaderboard, in sUSDS.
 *
 * Both scopes read the blobs our own background job writes (`refresh-leaderboard-background`):
 *
 * - `scope=<contestId>` is one blob.
 * - `scope=global` is the sum of all five. The contests are disjoint market sets that together
 *   are the whole of deep funding, and every stored component is additive, so summing them *is*
 *   the all-markets board.
 *
 * Seer's materialized `pnl_leaderboard` (`app_id='deepfund'`) is kept as a top-up, for addresses
 * our contest blobs have no row for at all. Our blobs lead because Seer models deep funding as a
 * single `deepfund` app allowlist, which cannot express the five per-contest boards the tabs
 * need, and its rows carry neither `marketIds` nor a per-wallet `computedAt`. Deriving both
 * scopes from one pipeline is what keeps the global tab consistent with the contest tabs.
 *
 * A frozen `updated_at` on Seer's rows is not staleness. Its refresh only considers wallets with
 * analytics activity in the last `PNL_LEADERBOARD_RECENT_DAYS` (5) UTC days, so an idle chain
 * stops being recomputed by design — PnL that cannot change is not recalculated. Chain 10 froze
 * at 2026-08-14T23:51Z because the last Optimism outcome-token transfer was ~08-09: that was the
 * final day the activity still fell inside the 5-day window, which is also why every `app_id` on
 * the chain froze at the same instant while chain 100 kept moving. Those rows are current, not
 * dead. (Seer's job also grew trade-executor support upstream in 2026-08, so its rows are no
 * longer EOA-only either.)
 *
 * Both paths then roll trade-executor contracts into the EOA that owns them (see
 * `utils/executorOwners.ts`) so one participant is one row, and rank the result by `sortBy`
 * (P/L, volume or ROI — the three columns the table shows). That rollup is
 * why neither path can paginate in SQL: two rows that merge may sit on different pages. The
 * sets are small — 121 wallets globally, at most 70 in a contest — so both are sorted and
 * sliced in memory, behind a 60 s edge cache.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

/** Seer's app id for deep funding — the five contests, expanded to their children. */
const DEEPFUND_APP_ID = "deepfund";

type ApiRow = {
  rank: number;
  address: string;
  pnl: number;
  volume: number;
  roi: number | null;
  marketCount: number;
  /** Extra wallets merged into this row; absent when the participant has only one. */
  mergedWallets?: string[];
};

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Address search accepts a hex fragment, with or without the 0x. */
function normalizeSearch(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const fragment = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]*$/.test(fragment) || fragment.length === 0) return null;
  return fragment;
}

function toApiRow(row: RolledUpRow, rank: number): ApiRow {
  const merged = row.members.filter((member) => member !== row.address);
  return {
    rank,
    address: row.address,
    pnl: row.pnl,
    volume: row.volume,
    roi: row.roi,
    marketCount: row.marketCount,
    ...(merged.length > 0 ? { mergedWallets: merged } : {}),
  };
}

/** Every wallet the participant trades from is searchable, not just the one they rank under. */
function matchesSearch(row: RolledUpRow, search: string): boolean {
  return row.members.some((member) => member.includes(search));
}

function paginate(args: {
  rows: RolledUpRow[];
  limit: number;
  offset: number;
  search: string | null;
}) {
  const { rows, limit, offset, search } = args;
  const ranked = rows.map((row, index) => ({ row, rank: index + 1 }));
  const filtered = search ? ranked.filter(({ row }) => matchesSearch(row, search)) : ranked;
  return {
    total: filtered.length,
    // Rank is the position on the unfiltered board, so a search does not renumber the ranking.
    rows: filtered.slice(offset, offset + limit).map(({ row, rank }) => toApiRow(row, rank)),
  };
}

function rankFor(rows: RolledUpRow[], address: string) {
  const index = rows.findIndex((row) => row.members.includes(address) || row.address === address);
  return { address, rank: index === -1 ? null : index + 1, total: rows.length };
}

/**
 * The global board: our five contest blobs summed, topped up from Seer's `deepfund` rows for any
 * address we have not scored at all, then rolled up by owner.
 *
 * Taking only uncovered addresses from Seer is what keeps a wallet from being counted twice —
 * the same guarantee as before, with the filter on the other side now that our own data leads.
 */
async function loadGlobalRows(period: PortfolioPlPeriod, owners: OwnerMap) {
  const boards = await readAllContestLeaderboards();
  const ours = sumContestRows(boards, period);
  const covered = new Set(ours.map((row) => row.address));

  const { data, error } = await supabase
    .from("pnl_leaderboard")
    .select("address, pnl, volume, market_count, value_start, trading_collateral_net_out, updated_at")
    .eq("app_id", DEEPFUND_APP_ID)
    .eq("chain_id", CHAIN_ID)
    .eq("period", period);
  if (error) throw error;

  const fallback: (LeaderboardRow & { updatedAt: string | null })[] = (data ?? [])
    .map((row) => ({
      address: String(row.address).toLowerCase(),
      pnl: Number(row.pnl) || 0,
      volume: Number(row.volume) || 0,
      // Recomputed from the summed components after the rollup, so the stored value is not read.
      roi: null,
      marketCount: Number(row.market_count) || 0,
      valueStart: Number(row.value_start) || 0,
      tradingCollateralNetOut: Number(row.trading_collateral_net_out) || 0,
      updatedAt: (row.updated_at as string | null) ?? null,
    }))
    .filter((row) => !covered.has(row.address));

  // The board is as fresh as its worst row. A borrowed row's `updated_at` is Seer's last *write*,
  // not a bound on correctness (see the note above on the 5-day refresh window), so on an idle
  // chain this reports older than the data really is. Kept deliberately: understating freshness
  // is the safe direction, and these rows are a top-up for wallets we do not score ourselves.
  const timestamps = [
    oldestComputedAt(boards, period),
    ...fallback.map((row) => row.updatedAt),
  ].filter((at): at is string => !!at);

  return {
    rows: rollUpRows([...ours, ...fallback], owners),
    updatedAt: timestamps.length > 0 ? timestamps.sort()[0] : null,
  };
}

async function loadContestRows(contestId: string, period: PortfolioPlPeriod, owners: OwnerMap) {
  const board = await readContestLeaderboard(contestId);
  return {
    rows: rollUpRows(board.rowsByPeriod[period] ?? [], owners),
    updatedAt: oldestComputedAt([board], period),
  };
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const scope = (url.searchParams.get("scope") ?? "global").toLowerCase();
    const period = (url.searchParams.get("period") ?? "all").toLowerCase();
    const search = normalizeSearch(url.searchParams.get("search") ?? "");
    const rankForRaw = (url.searchParams.get("rankFor") ?? "").trim().toLowerCase();
    const sortBy = (url.searchParams.get("sortBy") ?? "pnl").toLowerCase();
    const sortDir = (url.searchParams.get("sortDir") ?? "desc").toLowerCase();

    if (!isLeaderboardPeriod(period)) {
      return jsonResponse({ error: "period must be one of: 1d, 1w, 1m, all" }, 400, corsHeaders);
    }
    if (!isLeaderboardSort(sortBy)) {
      return jsonResponse({ error: "sortBy must be one of: pnl, volume, roi" }, 400, corsHeaders);
    }
    if (!isLeaderboardSortDir(sortDir)) {
      return jsonResponse({ error: "sortDir must be one of: desc, asc" }, 400, corsHeaders);
    }
    if (scope !== "global" && !isContestId(scope)) {
      return jsonResponse({ error: `unknown scope: ${scope}` }, 400, corsHeaders);
    }
    if (rankForRaw && !/^0x[a-f0-9]{40}$/.test(rankForRaw)) {
      return jsonResponse({ error: "rankFor must be a 0x-prefixed address" }, 400, corsHeaders);
    }

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const owners = await readOwnerMap();
    const { rows: unsorted, updatedAt } =
      scope === "global"
        ? await loadGlobalRows(period, owners)
        : await loadContestRows(scope, period, owners);

    // Ranked before both `rankFor` and `paginate`, so "Your rank" answers for the board the user
    // is actually looking at rather than always for the P/L one.
    const rows = sortRows(unsorted, sortBy, sortDir);

    if (rankForRaw) {
      // A connected trade-executor ranks where its owner does.
      return jsonResponse(rankFor(rows, canonicalAddress(rankForRaw, owners)), 200, {
        ...EDGE_CACHE_HEADERS,
        ...corsHeaders,
      });
    }

    const page = paginate({ rows, limit, offset, search });
    return jsonResponse(
      {
        scope,
        period,
        sortBy,
        sortDir,
        unit: "sUSDS",
        updatedAt,
        total: page.total,
        limit,
        offset,
        rows: page.rows,
      },
      200,
      { ...EDGE_CACHE_HEADERS, ...corsHeaders },
    );
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
