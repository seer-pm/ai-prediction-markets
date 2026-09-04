import { useContest } from "@/components/contest/contestState";
import { OutcomeTradeDialog } from "@/components/trade/OutcomeTradeDialog";
import { RedeemL2Interface } from "@/components/trade/RedeemL2Interface";
import { SellAllTokensInterface } from "@/components/trade/SellAllTokensInterface";
import { Button, Card, ErrorPanel, Panel, Skeleton } from "@/components/ui";
import {
  ZcashNu7MarketCard,
  type OutcomeTradeRequest,
} from "@/components/ZcashNu7MarketCard";
import { useRedeemZcashNu7 } from "@/hooks/useRedeemZcashNu7";
import { useSellAllZcashNu7, type SellAllNu7Position } from "@/hooks/useSellAllZcashNu7";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { useZcashNu7MarketsData } from "@/hooks/useZcashNu7MarketsData";
import { collateral } from "@/utils/constants";
import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { invalidIndexOf } from "@/utils/zcashNu7Markets";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";

/**
 * The Zcash NU7 coinholder poll — five categorical ballot questions.
 *
 * The one tab in this app that is not a prediction contest. The others take a CSV of your numbers,
 * diff it against the market and execute the whole disagreement in a single batched run; there is
 * no CSV here, no target price and no strategy. You pick an outcome, name an amount and trade it.
 *
 * That is a deliberate fit to the shape of the thing: 19 tradable outcomes across five questions is
 * a set someone forms a view on one at a time, and the trade wallet is already funded and approved,
 * so a direct trade costs one signature (see `useTradeOutcome`).
 */
export const ZcashNu7Markets = () => {
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [trade, setTrade] = useState<OutcomeTradeRequest | null>(null);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { data, isLoading, error } = useZcashNu7MarketsData();
  const markets = useMemo(() => data?.markets ?? [], [data?.markets]);

  // Every outcome token of every market, flat and in market-then-outcome order. The card slices its
  // own window back out by offset, so this order is load-bearing.
  const allTokens = useMemo(
    () => markets.flatMap((market) => market.wrappedTokens),
    [markets],
  );
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    tradeExecutor as Address,
    allTokens,
  );

  const { data: collateralBalance, isLoading: isLoadingCollateral } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  // Where each market's outcomes start in the flat balance array.
  const offsets = useMemo(() => {
    let cursor = 0;
    return markets.map((market) => {
      const start = cursor;
      cursor += market.wrappedTokens.length;
      return start;
    });
  }, [markets]);

  const balanceByToken = useMemo(() => {
    const mapping: Record<string, bigint> = {};
    allTokens.forEach((token, index) => {
      const balance = balances?.[index];
      if (balance !== undefined) mapping[token.toLowerCase()] = balance;
    });
    return mapping;
  }, [allTokens, balances]);

  const sellAll = useSellAllZcashNu7();
  const redeem = useRedeemZcashNu7();

  /** Everything held, with Invalid flagged so the liquidation can skip it. */
  const positions = useMemo<SellAllNu7Position[]>(
    () =>
      markets.flatMap((market) =>
        market.wrappedTokens.map((token, index) => ({
          outcomeToken: token,
          outcomeSymbol: market.outcomes[index] ?? "",
          collateralToken: market.collateralToken,
          balance: balanceByToken[token.toLowerCase()] ?? 0n,
          tradable:
            index !== invalidIndexOf(market.wrappedTokens) && market.prices[index] !== null,
        })),
      ),
    [markets, balanceByToken],
  );

  const hasSellTokens = useMemo(
    () => positions.some((position) => position.tradable && position.balance > 0n),
    [positions],
  );

  // Settled markets, with every outcome token — Invalid included, since an unresolvable ballot
  // question settles there and that token would then be the only one worth claiming.
  const closedMarkets = useMemo(
    () =>
      markets
        .filter((market) => market.marketStatus === MarketStatus.CLOSED)
        .map(({ id, wrappedTokens }) => ({ id, wrappedTokens })),
    [markets],
  );
  const closedTokens = useMemo(
    () => closedMarkets.flatMap((market) => market.wrappedTokens),
    [closedMarkets],
  );
  const hasRedeemable = useMemo(
    () => closedTokens.some((token) => (balanceByToken[token.toLowerCase()] ?? 0n) > 0n),
    [closedTokens, balanceByToken],
  );

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading && !isLoadingBalances && !!data && balancesResolved(balances, allTokens),
  });

  // No pool on any outcome of any market. Distinct from "still loading": a table of "No pool"
  // badges otherwise reads as a failure rather than a state.
  const hasNoLiquidity = useMemo(
    () => markets.length > 0 && markets.every((market) => market.prices.every((p) => p === null)),
    [markets],
  );

  const handleTrade = useCallback((request: OutcomeTradeRequest) => {
    startTransition(() => setTrade(request));
  }, []);

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const tradeToken = trade?.market.wrappedTokens[trade.outcomeIndex];

  return (
    <>
      <Panel tone="info" title="The NU7 coinholder poll">
        Five ballot questions, each a single-select market on Optimism. Buy the outcome you think
        coinholders will pick; a winning share settles at 1 sUSDS and everything else at 0. Prices
        here are what the market currently pays, not a forecast from us.
      </Panel>

      {/* No prediction file to upload, so this is a plain action row rather than `ContestBar`,
          which is built around a prediction count. */}
      {canTrade && (
        <Card className="flex flex-wrap items-center justify-end gap-3 !px-6 !py-4">
          {!finished && (
            <Button
              size="sm"
              onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
              disabled={!hasSellTokens}
              disabledReason={!hasSellTokens ? "You hold no outcome tokens here." : undefined}
            >
              Sell all positions
            </Button>
          )}
          {/* Trading stops with the contest; claiming what you already hold does not. */}
          {redeemState === "some" && (
            <Button
              size="sm"
              variant="success"
              onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
              disabled={!account}
            >
              Redeem to sUSDS
            </Button>
          )}
        </Card>
      )}

      {hasNoLiquidity && (
        <Panel tone="info" title="Not tradable yet">
          All five markets are live on Optimism, but no liquidity has been seeded, so there are no
          pools to price them. Prices and trading turn on once the pools exist.
        </Panel>
      )}

      {isLoading && !markets.length
        ? Array.from({ length: 5 }, (_, index) => (
            <Card key={index}>
              <Skeleton width="45%" height={14} />
              <Skeleton className="mt-3" width="80%" height={18} />
              <Skeleton className="mt-5" height={100} />
            </Card>
          ))
        : markets.map((market, marketIndex) => (
            <ZcashNu7MarketCard
              key={market.id}
              market={market}
              balances={market.wrappedTokens.map(
                (_, outcomeIndex) => balances?.[offsets[marketIndex] + outcomeIndex],
              )}
              balancesLoading={isLoadingBalances}
              canTrade={canTrade}
              tradingOpen={!finished}
              onTrade={handleTrade}
            />
          ))}

      {trade && tradeToken && tradeExecutor && (
        <OutcomeTradeDialog
          open
          onOpenChange={(open) => !open && setTrade(null)}
          side={trade.side}
          tradeExecutor={tradeExecutor}
          outcomeLabel={trade.market.outcomes[trade.outcomeIndex]}
          outcomeToken={tradeToken}
          outcomeSymbol={trade.market.outcomes[trade.outcomeIndex]}
          collateralToken={trade.market.collateralToken}
          outcomeBalance={balanceByToken[tradeToken.toLowerCase()] ?? 0n}
          collateralBalance={collateralBalance?.value ?? 0n}
          balanceLoading={isLoadingBalances || isLoadingCollateral}
          price={trade.market.prices[trade.outcomeIndex] ?? null}
        />
      )}

      <SellAllTokensInterface
        open={isSellAllDialogOpen}
        onOpenChange={setIsSellAllDialogOpen}
        isError={sellAll.isError}
        error={sellAll.error}
        isPending={sellAll.isPending}
        isSuccess={sellAll.isSuccess}
        progress={sellAll.progress}
        reset={sellAll.reset}
        onSellAll={() => tradeExecutor && sellAll.mutate({ tradeExecutor, positions })}
        isLoading={isLoading || isLoadingBalances}
        hasTokens={hasSellTokens}
      />

      <RedeemL2Interface
        open={isRedeemDialogOpen}
        onOpenChange={setIsRedeemDialogOpen}
        isError={redeem.isError}
        error={redeem.error}
        isPending={redeem.isPending}
        isSuccess={redeem.isSuccess}
        progress={redeem.progress}
        reset={redeem.reset}
        onRedeem={() => tradeExecutor && redeem.mutate({ tradeExecutor, markets: closedMarkets })}
        isLoading={isLoading || isLoadingBalances}
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
