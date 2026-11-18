import { toastError, toastSuccess } from "@/lib/toastify";
import { getAppUrl } from "@/utils/common";
import {
  canonicalLegs,
  submissionSignatureMessage,
  type PredictionLeg,
  type SubmissionContestId,
} from "@/utils/predictionSubmission";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";

export interface LeaderboardSubmission {
  contest: SubmissionContestId;
  legs: PredictionLeg[];
}

export interface SignedSubmission extends LeaderboardSubmission {
  address: string;
  issuedAt: string;
  signature: string;
}

export interface SubmitPredictionsResult {
  submittedAt: string;
  accepted: number;
  /** Legs dropped because their market already had an answer. */
  ignored: number;
}

/** The toast a saved submission gets, whether it went out with a trade run or on its own. */
export function toastSubmitted(result: SubmitPredictionsResult) {
  toastSuccess({
    title: "Predictions submitted to the leaderboard",
    subtitle:
      result.ignored > 0
        ? `${result.ignored} on markets that already have an answer were left out.`
        : "They stay hidden until the markets end.",
  });
}

export function toastSubmitFailed(error: unknown) {
  toastError({
    title: "Leaderboard submission failed",
    subtitle: error instanceof Error ? error.message : undefined,
  });
}

/**
 * Leaderboard submission, split into its two halves.
 *
 * `sign` is awaited before a strategy run starts, so the signature prompt and the run's own wallet
 * prompts never overlap. `send` is not: the POST can run beside the trade, and a failed save should
 * not hold up — or roll back — a trade that is already on its way.
 */
export function useSubmitPredictions() {
  const { address: account } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const sign = useCallback(
    async ({ contest, legs }: LeaderboardSubmission): Promise<SignedSubmission> => {
      if (!account) throw new Error("Connect a wallet first.");
      const canonical = canonicalLegs(legs);
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({
        account,
        message: submissionSignatureMessage({
          address: account,
          contest,
          legs: canonical,
          issuedAt,
        }),
      });
      return { address: account, contest, legs: canonical, issuedAt, signature };
    },
    [account, signMessageAsync],
  );

  const send = useCallback(
    async (signed: SignedSubmission): Promise<SubmitPredictionsResult> => {
      const response = await fetch(`${getAppUrl()}/.netlify/functions/submit-predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          errorMessage?: string;
        };
        throw new Error(body.error ?? body.errorMessage ?? `Request failed (${response.status})`);
      }
      void queryClient.invalidateQueries({ queryKey: ["usePredictionScores"], refetchType: "all" });
      return (await response.json()) as SubmitPredictionsResult;
    },
    [queryClient],
  );

  return { sign, send };
}
