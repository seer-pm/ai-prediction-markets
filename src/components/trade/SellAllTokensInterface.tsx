import { Button, Dialog, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import type { TxProgressState } from "@/hooks/useTxProgress";
import { SELL_ALL_PHASES, runStatus } from "@/utils/txPhases";
import React, { useEffect } from "react";
import { RunLedger } from "./RunLedger";

export interface SellAllTokensInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
  isError: boolean;
  error: unknown;
  isPending: boolean;
  isSuccess?: boolean;
  progress: TxProgressState;
  reset: () => void;
  onSellAll: () => void;
  /** True while balances or table data is still loading */
  isLoading: boolean;
  /** True if there are tokens to sell */
  hasTokens: boolean;
}

export const SellAllTokensInterface: React.FC<SellAllTokensInterfaceProps> = ({
  open,
  onOpenChange,
  description = "Swaps every outcome token you hold in this contest back to sUSDS.",
  isError,
  error,
  isPending,
  isSuccess = false,
  progress,
  reset,
  onSellAll,
  isLoading,
  hasTokens,
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
      title="Sell all positions"
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
          hasTokens && (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={isPending} fullWidth>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onSellAll}
              loading={isPending}
              disabled={isPending}
              fullWidth
            >
              Sell everything
            </Button>
          </>
          )
        )
      }
    >
      <div className="space-y-4">
        {isError && <ErrorPanel title="The sell run stopped" error={error} onDismiss={reset} />}

        {status !== "idle" && (
          <RunLedger
            phases={SELL_ALL_PHASES}
            current={progress.current}
            completed={progress.completed}
            skipped={progress.skipped}
            status={status}
          />
        )}

        {isLoading ? (
          <Panel tone="working" title="Reading your balances">
            Checking which outcome tokens the trade wallet holds.
          </Panel>
        ) : !hasTokens ? (
          <EmptyState
            title="Nothing to sell"
            description="The trade wallet holds no outcome tokens for this contest."
          />
        ) : (
          status === "idle" && (
            <Panel tone="error" title="Be careful">
              Selling everything at once may result in significant slippage, causing you to receive
              much less than expected. Proceed with caution.
            </Panel>
          )
        )}
      </div>
    </Dialog>
  );
};
