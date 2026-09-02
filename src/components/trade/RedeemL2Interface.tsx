import { Button, Dialog, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import type { TxProgressState } from "@/hooks/useTxProgress";
import { formatAmount } from "@/utils/format";
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
  /**
   * What the claim is worth at the resolved payouts, so the dialog can answer "how much do I get?"
   * before anything is signed. Omitted by contests that do not price their payouts yet — the
   * dialog then reads exactly as it did before.
   */
  payout?: {
    /** In whole collateral units. */
    amount: number;
    /** How many held outcomes actually pay out — what the amount is made of. */
    positions: number;
    symbol?: string;
  };
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
  payout,
}) => {
  const status = runStatus({ isPending, isSuccess, isError });

  // The figure is what the wallet holds *now*, so it goes stale the moment the run settles — the
  // ledger's receipt takes over there. A caller that cannot price the claim passes no `payout` at
  // all, which is different from a priced zero: that one is a real answer and gets said out loud,
  // because "you hold tokens but they all lost" is exactly what someone opening this wants to know.
  const showPayout = !!payout && !isLoading && hasRedeemable && status !== "succeeded";

  // Nothing to say once the run is idle and there is something to redeem — the
  // header already framed the action. Skipping the body keeps the dialog from
  // showing an empty band between two rules.
  const hasBody = isError || status !== "idle" || isLoading || !hasRedeemable || showPayout;

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
      {hasBody && (
        <div className="space-y-4">
          {isError && <ErrorPanel title="The redemption stopped" error={error} onDismiss={reset} />}

          {showPayout && payout && payout.amount === 0 && (
            <Panel title="These positions settled at zero">
              The trade wallet still holds outcome tokens here, but none of them won — redeeming
              returns no {payout.symbol ?? "sUSDS"}.
            </Panel>
          )}

          {showPayout && payout && payout.amount > 0 && (
            <div className="rounded-lg border border-long-rule bg-long-bg p-4">
              <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">
                You will receive
              </p>
              <p className="mt-1 font-mono text-display font-semibold tabular-nums text-long">
                {formatAmount(payout.amount)}{" "}
                <span className="text-title">{payout.symbol ?? "sUSDS"}</span>
              </p>
              <p className="mt-1 text-micro text-ink-3">
                {payout.positions === 1
                  ? "From 1 settled position, at its resolved payout."
                  : `Across ${payout.positions} settled positions, at their resolved payouts.`}{" "}
                The final on-chain amount can differ by rounding dust.
              </p>
            </div>
          )}

          {status !== "idle" && (
            <RunLedger
              phases={REDEEM_PHASES}
              current={progress.current}
              completed={progress.completed}
              skipped={progress.skipped}
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
          ) : null}
        </div>
      )}
    </Dialog>
  );
};
