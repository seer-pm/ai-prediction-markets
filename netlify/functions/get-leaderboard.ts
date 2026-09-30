import { isContestId } from "@/utils/contests";
import { EDGE_CACHE_HEADERS } from "./utils/cacheHeaders";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { canonicalAddress, readOwnerMap } from "./utils/executorOwners";
import {
  listSubmitters,
  scoreAddresses,
  submissionContestsFor,
} from "./utils/predictionSubmissions";
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
 * ranking by `sortBy` (P/L, volume, ROI or submission score), a `search` that filters
 * without renumbering the board, and `rankFor` answering for whichever column is being ranked
 * rather than always for P/L. All three need the whole board, which is why nothing here paginates
 * upstream: the sets are small — 121 wallets globally, at most ~70 in a contest — so the board is
 * pulled once, sorted and sliced in memory, behind a 60 s edge cache.
 *
 * The one thing added to Seer's board is prediction submitters it does not list — see
 * `withSubmitters`.
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

/**
 * Seer's board plus every wallet that submitted predictions in this scope but is not on it, as a
 * zero row, so the Score column has a row to land on.
 *
 * Seer lists a wallet only once its refresh has scored it in that scope, which is not the same set
 * as "entered the contest". A submission is sent before the trade it rides with and does not wait
 * for it, so a submitter may never have traded; and a wallet that did trade is missing from a
 * contest board until Seer's next lap over it after the contest's `sync:seer` deploy — the NU7
 * board read 2 rows against 9 wallets Seer had already scored on its markets.
 *
 * Matched by owner identity, not address: submissions are stored under the canonical owner, and a
 * Seer row may carry the owner or, unfolded, one of its executors. The added row's `members`
 * carries the owner's executors so search and "Your rank" find it the same way as a Seer row.
 */
async function withSubmitters(rows: BoardRow[], scope: string): Promise<BoardRow[]> {
  const contests = submissionContestsFor(scope);
  if (contests.length === 0) return rows;

  const submitters = await listSubmitters(contests);
  if (submitters.length === 0) return rows;

  const owners = await readOwnerMap();
  const onBoard = new Set(
    rows.flatMap((row) => row.members.map((member) => canonicalAddress(member, owners))),
  );
  const missing = submitters.filter((address) => !onBoard.has(canonicalAddress(address, owners)));
  if (missing.length === 0) return rows;

  const executorsByOwner = new Map<string, string[]>();
  for (const [executor, owner] of Object.entries(owners)) {
    executorsByOwner.set(owner, [...(executorsByOwner.get(owner) ?? []), executor]);
  }

  return [
    ...rows,
    ...missing.map((address) => ({
      address,
      pnl: 0,
      volume: 0,
      roi: null,
      marketCount: 0,
      members: [address, ...(executorsByOwner.get(address) ?? [])],
      updatedAt: null,
    })),
  ];
}

/**
 * Attach each row's submission score, for ranking by it. The Score column is otherwise fetched per
 * page by `get-prediction-scores`; ranking needs it for the whole board, so it is computed here, and
 * only when asked for — it costs the contests' on-chain market reads. Keyed by the row's address,
 * which `scoreAddresses` resolves to its owner's submission exactly as that endpoint does, so the
 * sort and the column cannot disagree.
 */
async function withScores(rows: BoardRow[], scope: string): Promise<BoardRow[]> {
  const scores = await scoreAddresses(
    rows.map((row) => row.address),
    scope,
  );
  return rows.map((row) => ({ ...row, score: scores[row.address]?.score ?? null }));
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
      return jsonResponse({ error: "sortBy must be one of: pnl, volume, roi, score" }, 400, corsHeaders);
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
    const boardRows = await withSubmitters(board.rows, scope);
    const rows = sortRows(
      sortBy === "score" ? await withScores(boardRows, scope) : boardRows,
      sortBy,
      sortDir,
    );

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
