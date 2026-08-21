import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";

export type LeaderboardPeriod = "1d" | "1w" | "1m" | "all";

/** `global` spans every deep market; anything else is a contest id from `@/utils/contests`. */
export type LeaderboardScope = "global" | string;

/** The three ranked columns. Kept in sync with `netlify/functions/utils/seerLeaderboard.ts`. */
export type LeaderboardSort = "pnl" | "volume" | "roi";
export type LeaderboardSortDir = "desc" | "asc";

export interface LeaderboardApiRow {
  rank: number;
  address: string;
  pnl: number;
  volume: number;
  roi: number | null;
  marketCount: number;
  /**
   * Trade-executor contracts folded into this participant's EOA. Absent when they only ever
   * traded from one address.
   */
  mergedWallets?: string[];
}

export interface LeaderboardApiResult {
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  sortBy: LeaderboardSort;
  sortDir: LeaderboardSortDir;
  unit: string;
  updatedAt: string | null;
  total: number;
  limit: number;
  offset: number;
  rows: LeaderboardApiRow[];
}

export interface LeaderboardRankResult {
  address: string;
  rank: number | null;
  total: number;
}

interface LeaderboardQuery {
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  sortBy?: LeaderboardSort;
  sortDir?: LeaderboardSortDir;
  search?: string;
  limit?: number;
  offset?: number;
}

function leaderboardUrl(params: Record<string, string>): string {
  return `${getAppUrl()}/.netlify/functions/get-leaderboard?${new URLSearchParams(params)}`;
}

async function fetchLeaderboard(query: LeaderboardQuery): Promise<LeaderboardApiResult> {
  const params: Record<string, string> = {
    scope: query.scope,
    period: query.period,
    sortBy: query.sortBy ?? "pnl",
    sortDir: query.sortDir ?? "desc",
    limit: String(query.limit ?? 25),
    offset: String(query.offset ?? 0),
  };
  if (query.search) params.search = query.search;

  const response = await fetch(leaderboardUrl(params));
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return response.json();
}

/** One-off lookup behind the "Your rank" button — deliberately not a cached query. */
export async function fetchLeaderboardRank(
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
  address: string,
  sortBy: LeaderboardSort = "pnl",
  sortDir: LeaderboardSortDir = "desc",
): Promise<LeaderboardRankResult> {
  const response = await fetch(
    leaderboardUrl({ scope, period, sortBy, sortDir, rankFor: address.toLowerCase() }),
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return response.json();
}

/**
 * Deliberately absent from `PERSISTED_QUERY_KEYS` (see `src/config/queryClient.ts`): a rank
 * restored from yesterday's localStorage reads as fact but isn't one. A short spinner is the
 * honest option.
 */
export const useLeaderboard = (query: LeaderboardQuery) => {
  return useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
    refetchInterval: false,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryKey: [
      "useLeaderboard",
      query.scope,
      query.period,
      query.sortBy ?? "pnl",
      query.sortDir ?? "desc",
      query.search ?? "",
      query.limit ?? 25,
      query.offset ?? 0,
    ],
    queryFn: () => fetchLeaderboard(query),
  });
};
