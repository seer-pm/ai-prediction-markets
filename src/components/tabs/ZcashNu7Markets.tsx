import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { RedeemL2Interface } from "@/components/trade/RedeemL2Interface";
import { SellAllTokensInterface } from "@/components/trade/SellAllTokensInterface";
import { ZcashNu7TradingInterface } from "@/components/trade/ZcashNu7TradingInterface";
import { Button, ErrorPanel, Panel } from "@/components/ui";
import { ZcashNu7MarketTable } from "@/components/ZcashNu7MarketTable";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessZcashNu7Predictions } from "@/hooks/useProcessZcashNu7Predictions";
import { useRedeemZcashNu7 } from "@/hooks/useRedeemZcashNu7";
import { useSellAllZcashNu7, type SellAllNu7Position } from "@/hooks/useSellAllZcashNu7";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { ZcashNu7Row } from "@/types";
import { downloadCsv } from "@/utils/common";
import { tradeDisabledReason } from "@/utils/contest";
import { parseZcashNu7CSV } from "@/utils/csvParser";
import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { sampleZcashNu7Predictions } from "@/utils/sampleZcashNu7Predictions";
import { isZcashNu7RowFundable } from "@/utils/zcashNu7Budget";
import { invalidIndexOf } from "@/utils/zcashNu7Markets";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import ZcashNu7Charts from "./ZcashNu7Charts";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";

const ZCASH_NU7_CSV_FORMAT: CSVFormatInfo = {
  headers: "question,outcome,prediction",
  exampleRows: ["1,2,0.45", "3,1,0.7"],
  description:
    "One row per outcome: the question number, the outcome number, and your prediction.",
};

const ZCASH_NU7_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "question", title: "question" },
    { key: "outcome", title: "outcome" },
    { key: "prediction", title: "prediction" },
  ],
  dataMapper: (row) => ({
    question: row.question,
    outcome: row.outcome,
    prediction: row.prediction,
  }),
  sampleData: sampleZcashNu7Predictions,
  filename: "zcash-nu7-predictions",
};

/**
 * The Zcash NU7 coinholder poll — five categorical ballot questions.
 *
 * Like the other contests this takes a CSV of your numbers, diffs it against the market and executes
 * the whole disagreement in one batched run. What is different is the shape of the file: NU7 is the
 * only categorical set here, so a row names a question *and* an outcome within it, and the number is
 * that one outcome's target price rather than a share of the question.
 *
 * Questions can be left out freely — an omitted question is simply not traded. Outcomes *within* an
 * annotated question cannot, because they are mutually exclusive and their targets have to sum to 1
 * to mean anything; what the file leaves out is derived from the market's own prices by
 * `completeNu7Targets` and traded alongside the rest. See its header for why the alternative costs
 * the user money.
 *
 * There is one way in: the file. The cards are a read-only market view showing your number beside
 * the market's, and every position is opened by the single batched run behind "Start trading".
 * Selling out and redeeming stay available, since those are exits rather than ways to take a view.
 */
export const ZcashNu7Markets = () => {
  const [predictions, setPredictions] = useLocalStorage<ZcashNu7Row[]>(
    "zcash-nu7-predictions",
    [],
  );
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);

  const {
    data: tableData,
    markets,
    balanceByToken,
    balances,
    allTokens,
    issues,
    isLoading,
    isLoadingBalances,
    error,
  } = useProcessZcashNu7Predictions(predictions);

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
      !isLoading && !isLoadingBalances && !!markets.length && balancesResolved(balances, allTokens),
  });

  // No pool on any outcome of any market. Distinct from "still loading": a wall of "No pool" badges
  // otherwise reads as a failure rather than a state.
  const hasNoLiquidity = useMemo(
    () => markets.length > 0 && markets.every((market) => market.prices.every((p) => p === null)),
    [markets],
  );

  const fundableCount = useMemo(
    () => tableData?.filter(isZcashNu7RowFundable).length ?? 0,
    [tableData],
  );

  const rejectedRows = useMemo(
    () =>
      issues.filter(
        (issue) => issue.kind === "no-such-outcome" || issue.kind === "no-pool",
      ),
    [issues],
  );
  const completionNotes = useMemo(
    () =>
      issues.filter(
        (issue) => issue.kind === "sum-renormalised" || issue.kind === "residual-exhausted",
      ),
    [issues],
  );

  const exportMarketView = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "question", title: "question" },
        { key: "outcome", title: "outcome" },
        { key: "prediction", title: "prediction" },
      ],
      // The market's own numbers, in exactly the format the upload expects: download it, edit the
      // rows you disagree with, upload it back. On this contest that round trip is load-bearing
      // rather than a convenience — outcome labels live on chain and appear in no static file, so an
      // export is how the numbering is learned. Outcomes with no pool are left out: a prediction on
      // one cannot be traded anyway, and including it would seed a row the diff hook then warns about.
      //
      // Each question's prices are scaled onto 1 before they are written. The pools only sit at 1 by
      // arbitrage, so on a busy day they drift — and a raw export summing past `NU7_SUM_TOLERANCE`
      // would be rejected by our own parser on the way back in, which is the one thing this file
      // must never do. Scaling also makes an unedited round trip mean what it looks like it means:
      // a coherent "I agree with the market", rather than a distribution the completion step would
      // quietly rescale underneath the user.
      tableData.flatMap((row) => {
        const pooled = row.outcomes.filter((leg) => leg.price !== null);
        const sum = pooled.reduce((total, leg) => total + (leg.price ?? 0), 0);
        const scale = sum > 0 ? 1 / sum : 0;
        return pooled.map((leg) => ({
          question: row.question,
          outcome: leg.outcomeNumber,
          prediction: Number(((leg.price ?? 0) * scale).toFixed(4)),
        }));
      }),
      "zcash-nu7-market-view",
    );
  }, [tableData]);

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason =
    hasNoLiquidity && !isLoading
      ? "No liquidity has been seeded yet, so there is nothing to trade against."
      : tradeDisabledReason({
          hasPredictions: predictions.length > 0,
          hasDifferences: fundableCount > 0,
          isLoading,
        });

  return (
    <>
      <ZcashNu7Charts markets={tableData ?? []} isLoading={isLoading} />

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          <>
            {canTrade && (
              <>
                {/* Trading stops with the contest; claiming what you already hold does not. */}
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
                {!finished && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => startTransition(() => setIsTradeDialogOpen(true))}
                    disabled={!!disabledReason || !account}
                    disabledReason={disabledReason}
                  >
                    Start trading
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {hasNoLiquidity && (
        <Panel tone="info" title="Not tradable yet">
          All five markets are live on Optimism, but no liquidity has been seeded, so there are no
          pools to price them. Predictions can be uploaded now. Prices and trading turn on once the
          pools exist.
        </Panel>
      )}

      {/* Two panels, because the two kinds of issue are not the same kind of news. A row that names
          something the ballot does not have is a mistake in the file; a question that had to be
          completed or rescaled is the system working as designed, and dressing it in an alert would
          teach the user to ignore the alert. */}
      {rejectedRows.length > 0 && (
        <Panel
          tone="error"
          title={`${rejectedRows.length} ${rejectedRows.length === 1 ? "row" : "rows"} in your file did not match the ballot`}
        >
          <ul className="list-inside list-disc space-y-1">
            {rejectedRows.map((issue) => (
              <li key={`${issue.kind}-${issue.question}-${issue.outcome}`}>
                {issue.kind === "no-such-outcome"
                  ? `Q${issue.question} has no outcome ${issue.outcome} — it has ${issue.substantiveCount}.`
                  : `Q${issue.question} outcome ${issue.outcome} (${issue.label}) has no pool yet, so it cannot be traded.`}
              </li>
            ))}
          </ul>
          <p className="mt-2">These rows are ignored; everything else was loaded.</p>
        </Panel>
      )}

      {completionNotes.length > 0 && (
        <Panel tone="info" title="How your predictions were completed">
          <ul className="list-inside list-disc space-y-1">
            {completionNotes.map((issue) => (
              <li key={`${issue.kind}-${issue.question}`}>
                {issue.kind === "sum-renormalised"
                  ? `Q${issue.question}: you gave every outcome a number and they sum to ${issue.sum.toFixed(2)}, not 1. They have been scaled to fit — check the question if that was not intended.`
                  : `Q${issue.question}: your own numbers account for the whole question, so the ${issue.unnamedCount === 1 ? "outcome" : `${issue.unnamedCount} outcomes`} you left out ${issue.unnamedCount === 1 ? "is" : "are"} being treated as worth ~0 and will be sold down.`}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ZcashNu7MarketTable
        markets={tableData ?? []}
        isLoading={isLoading && !tableData?.length}
        isLoadingBalances={isLoadingBalances}
        onExport={exportMarketView}
        exportDisabled={!tableData || hasNoLiquidity}
      />

      <GenericCSVUpload<ZcashNu7Row>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseZcashNu7CSV}
        formatInfo={ZCASH_NU7_CSV_FORMAT}
        sampleConfig={ZCASH_NU7_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <ZcashNu7TradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          markets={tableData}
          isLoadingBalances={isLoadingBalances}
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
