import { isContestId } from "@/utils/contests";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import {
  type BoardRow,
  fetchSeerBoard,
  isLeaderboardPeriod,
  isLeaderboardSort,
  isLeaderboardSortDir,
  sortRows,
} from "./utils/seerLeaderboard";

/**
 * P/L leaderboard, in USD.
 *
 * Both scopes are Seer's — `scope=global` is its `deepfund` board, `scope=<contestId>` its
 * `deepfund:<contestId>` one (see `utils/seerLeaderboard.ts` for why we stopped computing these
 * ourselves). Seer already folds a participant's trade-executor contracts into the EOA that owns
 * them, so one participant is one row before we ever see it.
 *
 * What this function still owns is the shape the table needs and Seer's endpoint does not offer:
 * ranking by `sortBy` (P/L, volume or ROI — the three sortable columns), a `search` that filters
 * without renumbering the board, and `rankFor` answering for whichever column is being ranked
 * rather than always for P/L. All three need the whole board, which is why nothing here paginates
 * upstream: the sets are small — 121 wallets globally, at most ~70 in a contest — so the board is
 * pulled once, sorted and sliced in memory, behind a 60 s edge cache.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

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

function toApiRow(row: BoardRow, rank: number): ApiRow {
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
function matchesSearch(row: BoardRow, search: string): boolean {
  return row.members.some((member) => member.includes(search));
}

function paginate(args: {
  rows: BoardRow[];
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

/** A connected trade-executor ranks where its owner does — `members` carries both. */
function rankFor(rows: BoardRow[], address: string) {
  const index = rows.findIndex((row) => row.members.includes(address));
  return { address, rank: index === -1 ? null : index + 1, total: rows.length };
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

    const board = await fetchSeerBoard(scope, period);

    // Ranked before both `rankFor` and `paginate`, so "Your rank" answers for the board the user
    // is actually looking at rather than always for the P/L one.
    const rows = sortRows(board.rows, sortBy, sortDir);

    if (rankForRaw) {
      return jsonResponse(rankFor(rows, rankForRaw), 200, {
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
        unit: "USD",
        updatedAt: board.updatedAt,
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
