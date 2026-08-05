import { Button, Dialog, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import { useGetRedeemStatus } from "@/hooks/useGetRedeemStatus";
import { useMarketsData } from "@/hooks/useMarketsData";
import { useRedeemToTradeExecutor } from "@/hooks/useRedeemToTradeExecutor";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import React from "react";
import { Address } from "viem";

interface RedeemInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
  tradeExecutor: Address;
}

export const RedeemInterface: React.FC<RedeemInterfaceProps> = ({
  open,
  onOpenChange,
  account,
  tradeExecutor,
}) => {
  const { data } = useMarketsData();
  const redeem = useRedeemToTradeExecutor(() => onOpenChange(false));

  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    tradeExecutor,
    data?.wrappedTokens,
  );
  const { data: redeemStatusData, isLoading: isLoadingRedeemStatus } = useGetRedeemStatus();

  const isLoading = isLoadingBalances || isLoadingRedeemStatus;
  const sumBalances = balances?.reduce((acc, curr) => acc + curr, 0n) ?? 0n;
  const canRedeem = !!redeemStatusData?.isRedeemable && sumBalances > 0n;

  // Nothing to say once the balances are in and there is something to redeem —
  // the header already framed the action. Skipping the body keeps the dialog
  // from showing an empty band between two rules.
  const hasBody = redeem.isError || isLoading || !canRedeem;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Redeem settled positions"
      description="Pays out your Round 1 outcome tokens at their resolved value, into the trade wallet."
      size="sm"
      dismissible={!redeem.isPending}
      footer={
        !isLoading &&
        canRedeem && (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={redeem.isPending} fullWidth>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={redeem.isPending}
              disabled={redeem.isPending || !balances}
              onClick={() =>
                balances &&
                redeem.mutate({
                  account,
                  tokens: data?.wrappedTokens ?? [],
                  amounts: balances,
                  tradeExecutor,
                })
              }
              fullWidth
            >
              Redeem
            </Button>
          </>
        )
      }
    >
      {hasBody && (
        <div className="space-y-4">
          {redeem.isError && (
            <ErrorPanel
              title="The redemption stopped"
              error={redeem.error}
              onDismiss={redeem.reset}
            />
          )}

          {isLoading ? (
            <Panel tone="working" title="Checking whether this round can be redeemed">
              Reading the resolution status and your balances.
            </Panel>
          ) : !redeemStatusData?.isRedeemable ? (
            <EmptyState
              title="Redemptions are not open yet"
              description="This round has to finish resolving before payouts can be claimed. Check back later."
            />
          ) : sumBalances === 0n ? (
            <EmptyState
              title="No settled positions to redeem"
              description="The trade wallet holds no Round 1 outcome tokens."
            />
          ) : null}
        </div>
      )}
    </Dialog>
  );
};
