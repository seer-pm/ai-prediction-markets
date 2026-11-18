import { Button, Tooltip } from "@/components/ui";
import {
  toastSubmitFailed,
  toastSubmitted,
  useSubmitPredictions,
  type LeaderboardSubmission,
} from "@/hooks/useSubmitPredictions";
import { useState } from "react";
import { useAccount } from "wagmi";

const EXPLANATION =
  "Sign your loaded predictions and save them for the leaderboard Score, without trading. " +
  "Submitting again replaces your predictions on every market that has no answer yet.";

interface SubmitPredictionsButtonProps {
  submission: LeaderboardSubmission;
  /** Predictions are loaded, so an empty `legs` means none of them name a market here. */
  hasPredictions: boolean;
}

/**
 * Leaderboard submission on its own, with no trade.
 *
 * The "Leaderboard submit" switch in the trade dialog only fires when a run starts, and a run is
 * blocked once the market already sits on every prediction. Someone who has already traded, or who
 * trades from a bot and only wants a Score, still needs a way to send the numbers in.
 *
 * Only the connected wallet signs, so the Score lands on that wallet's row, folded with its trade
 * executor. It needs no trade wallet.
 */
export function SubmitPredictionsButton({ submission, hasPredictions }: SubmitPredictionsButtonProps) {
  const { address: account } = useAccount();
  const { sign, send } = useSubmitPredictions();
  const [isPending, setIsPending] = useState(false);

  const disabledReason = !account
    ? "Connect a wallet to sign your predictions."
    : !hasPredictions
      ? "Upload a predictions CSV first."
      : submission.legs.length === 0
        ? "None of your predictions name a market in this contest."
        : undefined;

  const submit = async () => {
    setIsPending(true);
    try {
      // A failed signature is almost always a declined prompt, and the wallet library's own error
      // for that is a wall of text. Same wording as the trade dialog's switch.
      const signed = await sign(submission).catch(() => null);
      if (!signed) {
        toastSubmitFailed(new Error("The predictions were not signed, so nothing was saved."));
        return;
      }
      toastSubmitted(await send(signed));
    } catch (error) {
      toastSubmitFailed(error);
    } finally {
      setIsPending(false);
    }
  };

  const button = (
    <Button
      size="sm"
      onClick={() => void submit()}
      loading={isPending}
      disabled={!!disabledReason}
      disabledReason={disabledReason}
    >
      Submit predictions
    </Button>
  );

  return disabledReason || isPending ? button : <Tooltip content={EXPLANATION}>{button}</Tooltip>;
}
