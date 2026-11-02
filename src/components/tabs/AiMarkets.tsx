import { MarketTable } from "@/components/MarketTable";
import { RedeemInterface } from "@/components/trade/RedeemInterface";
import { Button, Card, ErrorPanel } from "@/components/ui";
import { useAiRedeemable } from "@/hooks/useAiRedeemable";
import { useProcessPredictions } from "@/hooks/useProcessPredictions";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { startTransition, useState } from "react";

export const AiMarkets = () => {
  const { data: tableData, isLoading, isLoadingBalances, error } = useProcessPredictions([]);
  const { account, tradeExecutor, isCreated } = useTradeWalletStatus();

  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { isRedeemable, availability: redeemState } = useAiRedeemable(tradeExecutor);

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  return (
    <>
      {isCreated && (
        <Card className="flex flex-col gap-3 !p-3 sm:flex-row sm:items-center sm:justify-between">
          {/* The copy used to promise payouts unconditionally, including to wallets holding
              nothing and before the round had even resolved. */}
          <p className="px-1 text-data text-ink-3">
            {redeemState === "some"
              ? "This contest has settled — you can claim your payouts."
              : redeemState === "none"
                ? isRedeemable
                  ? "This contest has settled. You hold nothing left to claim here."
                  : "This contest is still resolving. Payouts open once it settles."
                : "Checking whether you have payouts to claim…"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {redeemState === "some" && (
              <Button
                size="sm"
                variant="success"
                onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
              >
                Redeem to sUSDS
              </Button>
            )}
          </div>
        </Card>
      )}

      <MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />

      {account && tradeExecutor && (
        <>
          <RedeemInterface
            open={isRedeemDialogOpen}
            onOpenChange={setIsRedeemDialogOpen}
            account={account}
            tradeExecutor={tradeExecutor}
          />
        </>
      )}
    </>
  );
};
