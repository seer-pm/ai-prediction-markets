import { MarketTable } from "@/components/MarketTable";
import { RedeemInterface } from "@/components/trade/RedeemInterface";
import { WithdrawOutcomeTokensInterface } from "@/components/trade/WithdrawOutcomeTokensInterface";
import { Button, Card, ErrorPanel } from "@/components/ui";
import { useAiRedeemable } from "@/hooks/useAiRedeemable";
import { useMarketsData } from "@/hooks/useMarketsData";
import { useProcessPredictions } from "@/hooks/useProcessPredictions";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { startTransition, useMemo, useState } from "react";

export const AiMarkets = () => {
  const { data: tableData, isLoading, isLoadingBalances, error } = useProcessPredictions([]);
  const { account, tradeExecutor, isCreated } = useTradeWalletStatus();

  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { data: marketsData } = useMarketsData();
  const withdrawTokens = useMemo(() => marketsData?.wrappedTokens, [marketsData?.wrappedTokens]);

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
              ? "This contest has settled — you can claim payouts or move the tokens out."
              : redeemState === "none"
                ? isRedeemable
                  ? "This contest has settled. You hold nothing left to claim here, but any tokens can still be moved out."
                  : "This contest is still resolving. Payouts open once it settles; tokens can be moved out now."
                : "Tokens from this contest can be moved out at any time."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startTransition(() => setIsWithdrawTokensDialogOpen(true))}
            >
              Withdraw tokens
            </Button>
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
          <WithdrawOutcomeTokensInterface
            open={isWithdrawTokensDialogOpen}
            onOpenChange={setIsWithdrawTokensDialogOpen}
            account={account}
            tradeExecutor={tradeExecutor}
            tokens={withdrawTokens}
          />
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
