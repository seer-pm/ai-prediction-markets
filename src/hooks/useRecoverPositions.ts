import { queryClient } from "@/config/queryClient";
import {
  nextStep,
  readPositions,
  readRecoveryState,
  recoverPositions,
  RecoveryProgress,
} from "@/lib/recovery/strandedPositions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Address } from "viem";

/**
 * What `owner` holds outside their trade wallet among `tokens`, and the run that moves it back.
 * See `@/lib/recovery/strandedPositions`.
 */
export function useRecoverPositions(
  owner: Address | undefined,
  tradeWallet: Address | undefined,
  tokens: Address[],
) {
  const scan = useQuery({
    queryKey: ["recoverPositions", owner, tradeWallet, tokens],
    enabled: !!owner && !!tradeWallet && tokens.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    // Always read live: this page exists because a stale balance once cost a user a reverted
    // transaction, and nothing here is worth showing from a cache.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { positions, unrecoverable } = await readPositions(owner!, tokens);
      const state = await readRecoveryState(owner!, tradeWallet!, positions);
      return { positions, unrecoverable, state, step: nextStep(state) };
    },
  });

  const [progress, setProgress] = useState<RecoveryProgress>();
  const run = useMutation({
    mutationFn: () =>
      recoverPositions({
        owner: owner!,
        tradeWallet: tradeWallet!,
        positions: scan.data?.positions ?? [],
        onProgress: setProgress,
      }),
    onSettled: () => {
      scan.refetch();
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
    },
  });

  return { scan, run, progress, resetProgress: () => setProgress(undefined) };
}
