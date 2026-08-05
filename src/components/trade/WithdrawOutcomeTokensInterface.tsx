import { Button, Dialog, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useWithdrawFromTradeExecutor } from "@/hooks/useWithdrawFromTradeExecutor";
import React from "react";
import { Address } from "viem";

export interface WithdrawOutcomeTokensInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
  tradeExecutor: Address;
  /** The outcome token addresses to withdraw. Computed by the parent from market data. */
  tokens: Address[] | undefined;
}

export const WithdrawOutcomeTokensInterface: React.FC<WithdrawOutcomeTokensInterfaceProps> = ({
  open,
  onOpenChange,
  account,
  tradeExecutor,
  tokens,
}) => {
  const withdraw = useWithdrawFromTradeExecutor(() => onOpenChange(false));
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(tradeExecutor, tokens);

  const sumBalances = balances?.reduce((acc, curr) => acc + curr, 0n) ?? 0n;
  const hasTokens = sumBalances > 0n;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Withdraw outcome tokens"
      description="Moves every outcome token this contest holds out of the trade wallet and into your own."
      size="sm"
      dismissible={!withdraw.isPending}
      footer={
        !isLoadingBalances &&
        hasTokens && (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={withdraw.isPending} fullWidth>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={withdraw.isPending}
              disabled={withdraw.isPending || !balances}
              onClick={() =>
                balances &&
                withdraw.mutate({ account, tokens: tokens ?? [], amounts: balances, tradeExecutor })
              }
              fullWidth
            >
              Withdraw
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {withdraw.isError && (
          <ErrorPanel title="Withdrawal failed" error={withdraw.error} onDismiss={withdraw.reset} />
        )}

        {isLoadingBalances ? (
          <Panel tone="working" title="Reading your balances">
            Checking which outcome tokens the trade wallet holds.
          </Panel>
        ) : !hasTokens ? (
          <EmptyState
            title="Nothing to withdraw"
            description="The trade wallet holds no outcome tokens for this contest."
          />
        ) : (
          <Panel tone="error" title="You will have to handle these positions one at a time">
            Batching only works from the trade wallet. Once these tokens are in your own wallet,
            every trade and every redemption becomes a separate transaction you sign yourself.
          </Panel>
        )}
      </div>
    </Dialog>
  );
};
