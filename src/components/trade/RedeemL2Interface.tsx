import { Button, Dialog, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import type { TxProgressState } from "@/hooks/useTxProgress";
import { REDEEM_PHASES, runStatus } from "@/utils/txPhases";
import React, { useEffect } from "react";
import { RunLedger } from "./RunLedger";

export interface RedeemL2InterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isError: boolean;
  error: unknown;
  isPending: boolean;
  isSuccess?: boolean;
  progress: TxProgressState;
  reset: () => void;
  onRedeem: () => void;
  isLoading: boolean;
  hasRedeemable: boolean;
  description?: string;
}

export const RedeemL2Interface: React.FC<RedeemL2InterfaceProps> = ({
  open,
  onOpenChange,
  isError,
  error,
  isPending,
  isSuccess = false,
  progress,
  reset,
  onRedeem,
  isLoading,
  hasRedeemable,
  description = "Settled outcome tokens pay out at their resolved value, straight back to sUSDS.",
}) => {
  const status = runStatus({ isPending, isSuccess, isError });

  // Clear the run on dismissal, so reopening starts from a clean slate rather
  // than the previous receipt.
  useEffect(() => {
    if (!open) {
      progress.reset();
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Redeem settled positions"
      description={description}
      size="sm"
      dismissible={!isPending}
      footer={
        status === "succeeded" ? (
          <Button variant="primary" onClick={() => onOpenChange(false)} fullWidth>
            Done
          </Button>
        ) : (
          !isLoading &&
          hasRedeemable && (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={isPending} fullWidth>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onRedeem}
              loading={isPending}
              disabled={isPending}
              fullWidth
            >
              Redeem
            </Button>
          </>
          )
        )
      }
    >
      <div className="space-y-4">
        {isError && <ErrorPanel title="The redemption stopped" error={error} onDismiss={reset} />}

        {status !== "idle" && (
          <RunLedger
            phases={REDEEM_PHASES}
            current={progress.current}
            completed={progress.completed}
            status={status}
          />
        )}

        {isLoading ? (
          <Panel tone="working" title="Reading your balances">
            Checking which settled markets you still hold tokens in.
          </Panel>
        ) : !hasRedeemable ? (
          <EmptyState
            title="No settled positions to redeem"
            description="Either these markets have not resolved yet, or you have already redeemed them."
          />
        ) : (
null
        )}
      </div>
    </Dialog>
  );
};
