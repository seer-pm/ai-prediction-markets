import { ContestBar } from "@/components/contest/ContestBar";
import { FigureLabel } from "@/components/contest/FigureLabel";
import { ContestChart } from "@/components/contest/ContestChart";
import { useContest } from "@/components/contest/contestState";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { SubmitPredictionsButton } from "@/components/predictions/SubmitPredictionsButton";
import { ZcashTradingInterface } from "@/components/trade/ZcashTradingInterface";
import { Button, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import { ZcashMarketTable } from "@/components/ZcashMarketTable";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { chartLiquidity, chartVolume, liveSeries, useMarketCharts } from "@/hooks/useMarketCharts";
import { useProcessZcashPredictions } from "@/hooks/useProcessZcashPredictions";
import { useRedeemZcash } from "@/hooks/useRedeemZcash";
import type { LeaderboardSubmission } from "@/hooks/useSubmitPredictions";
import { useSellZcashToCollateral } from "@/hooks/useSellZcashToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { useZcashMarketsData } from "@/hooks/useZcashMarketsData";
import { ZcashRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { tradeDisabledReason } from "@/utils/contest";
import { getContest } from "@/utils/contests";
import { parseZcashCSV } from "@/utils/csvParser";

import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { TOP_LEVEL_WITHDRAW_PHASES, mergeFirstSellCopy } from "@/utils/txPhases";
import { isZcashRowFundable } from "@/utils/zcashBudget";
import { YES_INDEX } from "@/utils/zcashMarkets";
import { sampleZcashRoundPredictions, ZCASH_ROUNDS, type ZcashRoundId } from "@/utils/zcashRounds";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";

/** The first and last proposal on the ballot, as the upload dialog's example rows. */
const csvFormatOf = (roundId: ZcashRoundId): CSVFormatInfo => {
  const { markets } = ZCASH_ROUNDS[roundId];
  return {
    headers: "project,probability",
    exampleRows: [`${markets[0].title},0.82`, `${markets[markets.length - 1].title},0.15`],
    description:
      "One row per proposal, and how likely you think coinholders are to fund it — a number between 0 and 1, so 0.82 means 82%.",
    valueColumn: "probability",
  };
};

const sampleConfigOf = (roundId: ZcashRoundId): SampleCsvConfig => ({
  columns: [
    { key: "project", title: "project" },
    { key: "probability", title: "probability" },
  ],
  dataMapper: (row) => ({
    project: row.project,
    probability: row.probability,
  }),
  sampleData: sampleZcashRoundPredictions(roundId),
  filename: ZCASH_ROUNDS[roundId].sampleFilename,
});

/** Zcash Grants, Q3 2026: 37 proposals. */
export const ZcashMarkets = () => <ZcashGrantsMarkets roundId="zcash" />;

/** Zcash Grants Round 2, Q4 2026: 55 proposals. */
export const ZcashQ4Markets = () => <ZcashGrantsMarkets roundId="zcash-q4" />;

const ZcashGrantsMarkets = ({ roundId }: { roundId: ZcashRoundId }) => {
  const round = ZCASH_ROUNDS[roundId];
  const csvFormat = useMemo(() => csvFormatOf(roundId), [roundId]);
  const sampleConfig = useMemo(() => sampleConfigOf(roundId), [roundId]);
  const parseCsv = useCallback((text: string) => parseZcashCSV(text, roundId), [roundId]);
  const [predictions, setPredictions] = useLocalStorage<ZcashRow[]>(round.storageKey, []);
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
    marketIdToProject,
  } = useProcessZcashPredictions(predictions, roundId);

  // Every proposal shares one chart, so they are fetched together rather than once each.
  const chartMarketIds = useMemo(() => Object.keys(marketIdToProject), [marketIdToProject]);
  const {
    data: charts,
    isLoading: isLoadingCharts,
    error: chartsError,
  } = useMarketCharts(chartMarketIds);

  // Raw market data for redeem scope (React Query dedupes with useProcessZcashPredictions).
  const { data: zcashMarketData } = useZcashMarketsData(roundId);

  const sellAll = useSellZcashToCollateral();
  const redeem = useRedeemZcash();

  const closedMarkets = useMemo(
    () =>
      (zcashMarketData?.markets ?? [])
        .filter((market) => market.marketStatus === MarketStatus.CLOSED)
        .map(({ id, wrappedTokens }) => ({ id, wrappedTokens })),
    [zcashMarketData?.markets],
  );

  // Every outcome token of every closed market, Invalid included — a proposal that resolves Invalid
  // (withdrawn, in Q3; one that cannot be matched to a ballot item, in both rounds) leaves that
  // token as the only one worth redeeming.
  const closedTokens = useMemo(
    () => closedMarkets.flatMap((market) => market.wrappedTokens),
    [closedMarkets],
  );
  const { data: closedBalances, isLoading: isLoadingClosedBalances } = useTokensBalances(
    tradeExecutor as Address,
    closedTokens,
  );

  const chartData = useMemo(() => {
    if (!charts) return undefined;
    return Object.entries(marketIdToProject).flatMap(([marketId, project]) => {
      // Index 0 is YES — the number this pilot exists to publish.
      const series = liveSeries(charts[marketId.toLowerCase()])?.[YES_INDEX];
      return series ? [{ ...series, outcomeName: project }] : [];
    });
  }, [charts, marketIdToProject]);

  const volumeLabel = useMemo(() => {
    const volumes = Object.values(charts ?? {}).flatMap((chart) => chartVolume(chart) ?? []);
    if (!volumes.length) return undefined;
    const cash = volumes.reduce((acc, curr) => acc + curr.collateral, 0);
    // One market missing the count would make the total read as if it had not traded, so the
    // notional figure is only shown once every market carries one.
    const tokens = volumes.every((v) => v.tokens !== undefined)
      ? volumes.reduce((acc, curr) => acc + curr.tokens!, 0)
      : undefined;
    return (
      <FigureLabel
        label="Total volume"
        cash={cash}
        tokens={tokens}
        suffix={` across ${volumes.length} markets`}
      />
    );
  }, [charts]);

  // Summed, like the volume beside it: every market here is collateralised in sUSDS, so the totals
  // are in one unit.
  const liquidityLabel = useMemo(() => {
    const pools = Object.values(charts ?? {}).flatMap((chart) => chartLiquidity(chart) ?? []);
    if (!pools.length) return undefined;
    const cash = pools.reduce((acc, curr) => acc + curr.collateral, 0);
    return <FigureLabel label="Liquidity" cash={cash} />;
  }, [charts]);

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((row) => row.yesBalance || row.noBalance)?.length,
    [tableData],
  );

  // What this round sends to the leaderboard — from the trade dialog's "Leaderboard submit" and
  // from "Submit predictions" alike, so the two always send the same numbers. Only this contest's
  // own markets, which is also what the write endpoint accepts.
  const leaderboardSubmission = useMemo<LeaderboardSubmission>(() => {
    const allowed = new Set((getContest(roundId)?.marketIds ?? []).map((id) => id.toLowerCase()));
    return {
      contest: roundId,
      legs: (tableData ?? [])
        .filter(
          (row) =>
            row.predictedProbability !== null &&
            !!row.marketId &&
            allowed.has(row.marketId.toLowerCase()),
        )
        .map((row) => ({
          marketId: row.marketId,
          outcomeIndex: YES_INDEX,
          prediction: row.predictedProbability as number,
        })),
    };
  }, [roundId, tableData]);

  const hasRedeemable = useMemo(() => (closedBalances ?? []).some((b) => b > 0n), [closedBalances]);

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading &&
      !isLoadingBalances &&
      !!zcashMarketData &&
      balancesResolved(closedBalances, closedTokens),
  });

  // Same predicate the budget uses, so the button, the preflight count and the allocation cannot
  // disagree about which markets are in play.
  const tradableCount = useMemo(
    () => tableData?.filter(isZcashRowFundable).length ?? 0,
    [tableData],
  );

  // No pool exists on either side of any market. Pools were seeded on 2026-08-22, so this should
  // now be false; it stays because it is also what a re-seed window or a withdrawn pool set looks
  // like, and a table of "No pool" badges otherwise reads as a failure rather than a state.
  const hasNoLiquidity = useMemo(
    () =>
      !!tableData?.length &&
      tableData.every((row) => row.yesPrice === null && row.noPrice === null),
    [tableData],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData || !tradeExecutor) return;
    sellAll.mutate({ tradeExecutor, tableData });
  }, [tableData, sellAll, tradeExecutor]);

  const exportMarketView = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "project", title: "project" },
        { key: "probability", title: "probability" },
      ],
      // The market's own number, written in the format the upload expects: download it, edit the
      // rows you disagree with, upload it back.
      tableData.map((row) => ({
        project: row.project,
        probability: Number((row.yesPrice ?? 0).toFixed(4)),
      })),
      round.exportFilename,
    );
  }, [tableData, round.exportFilename]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
      <EmptyState
        title="Say how likely each grant is to get funded"
        description="Upload a file giving each proposal a probability between 0 and 1. It sits next to the market price so you can see where you disagree."
      >
        <PredictionDropzone
          storageKey={round.storageKey}
          loadedCount={0}
          className="w-full max-w-lg"
          compact
          parseFn={parseCsv}
          onDataParsed={setPredictions}
        />
      </EmptyState>
    ),
    [setPredictions, round.storageKey, parseCsv],
  );

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason =
    hasNoLiquidity && !isLoading
      ? "No liquidity has been seeded yet, so there is nothing to trade against."
      : tradeDisabledReason({
          hasPredictions: predictions.length > 0,
          hasDifferences: tradableCount > 0,
          isLoading,
        });

  return (
    <>
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoadingCharts}
        error={chartsError}
        eyebrow={`Zcash · ${round.poll}`}
        title="Approval odds over time"
        description="Each line is one proposal's YES price — the market's estimate of its chance of being approved."
        volume={volumeLabel}
        liquidity={liquidityLabel}
        refreshMarketIds={chartMarketIds}
      />

      {/* Pools can be pulled after resolution; on a settled contest that is not "not tradable yet". */}
      {hasNoLiquidity && !finished && (
        <Panel tone="info" title="Not tradable yet">
          All {round.markets.length} markets are live on Optimism, but no liquidity has been
          seeded, so there are no pools to price them. Predictions can be uploaded now. Prices and trading turn on once the
          pools exist.
        </Panel>
      )}

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          <>
            {/* Outside `canTrade`: submitting needs a signature, not a trade wallet. */}
            {!finished && (
              <SubmitPredictionsButton
                submission={leaderboardSubmission}
                hasPredictions={predictions.length > 0}
              />
            )}
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

      <ZcashMarketTable
        roundId={roundId}
        markets={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportMarketView}
        exportDisabled={!tableData || hasNoLiquidity}
      />

      <GenericCSVUpload<ZcashRow>
        storageKey={round.storageKey}
        loadedCount={predictions.length}
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseCsv}
        formatInfo={csvFormat}
        sampleConfig={sampleConfig}
      />

      {tradeExecutor && tableData && (
        <ZcashTradingInterface
          roundId={roundId}
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
        {...mergeFirstSellCopy("YES and NO")}
        phases={TOP_LEVEL_WITHDRAW_PHASES}
        isError={sellAll.isError}
        error={sellAll.error}
        isPending={sellAll.isPending}
        isSuccess={sellAll.isSuccess}
        progress={sellAll.progress}
        reset={sellAll.reset}
        onSellAll={handleSellAll}
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
        isLoading={isLoading || isLoadingBalances || isLoadingClosedBalances}
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
