import { fetchAppJson } from "@/utils/common";
import type { PredictionScore } from "@/utils/predictionSubmission";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isAddress } from "viem";
import type { LeaderboardScope } from "./useLeaderboard";

interface ScoresResponse {
  scores: Record<string, PredictionScore>;
}

/**
 * Leaderboard submission scores for a page of rows, keyed by lowercased address. Wallets that never
 * submitted are absent. Same one-batched-request shape as `useProfiles`, for the same reason.
 *
 * Not persisted (absent from `PERSISTED_QUERY_KEYS`): a score changes when a market resolves, and a
 * stale one restored from localStorage would read as current.
 */
export function usePredictionScores(
  addresses: string[],
  scope: LeaderboardScope,
): Record<string, PredictionScore> {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    for (const address of addresses) {
      if (address && isAddress(address)) seen.add(address.toLowerCase());
    }
    return [...seen].sort();
  }, [addresses]);

  const { data } = useQuery({
    queryKey: ["usePredictionScores", scope, unique.join(",")],
    queryFn: () =>
      fetchAppJson<ScoresResponse>("get-prediction-scores", {
        scope,
        addresses: unique.join(","),
      }),
    enabled: unique.length > 0,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return data?.scores ?? EMPTY;
}

const EMPTY: Record<string, PredictionScore> = {};
