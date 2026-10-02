import { ContestBar } from "@/components/contest/ContestBar";
import { FigureLabel } from "@/components/contest/FigureLabel";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { WITHDRAW_PHASES, mergeFirstSellCopy } from "@/utils/txPhases";
import { ContestChart } from "@/components/contest/ContestChart";
import { OriginalityMarketTable } from "@/components/OriginalityMarketTable";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { OriginalityTradingInterface } from "@/components/trade/OriginalityTradingInterface";
import { Button, Card, EmptyState, ErrorPanel } from "@/components/ui";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { chartLiquidity, chartVolume, liveSeries, useMarketCharts } from "@/hooks/useMarketCharts";
import { useOriginalityMarketsData } from "@/hooks/useOriginalityMarketsData";
import { useProcessOriginalityPredictions } from "@/hooks/useProcessOriginalityPredictions";
import { useRedeemOriginality } from "@/hooks/useRedeemOriginality";
import { useSellToCollateral } from "@/hooks/useSellToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { OriginalityRow } from "@/types";
import { downloadCsv, isUndefined, minBigIntArray } from "@/utils/common";
import { parseOriginalityCSV } from "@/utils/csvParser";
import {
  ORIGINALITY_ROUND_2,
  ORIGINALITY_ROUND_3,
  ORIGINALITY_ROUND_3_INCORRECT,
  OriginalityRound,
} from "@/utils/originalityRounds";

import { sampleOriginalityPredictions } from "@/utils/sampleOriginalityPredictions";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { WithdrawOutcomeTokensInterface } from "../trade/WithdrawOutcomeTokensInterface";

const ORIGINALITY_CSV_FORMAT: CSVFormatInfo = {
  headers: "repo,originality",
  exampleRows: [
    "https://github.com/a16z/helios,0.5",
    "https://github.com/ethereum/go-ethereum,0.15",
  ],
  description:
    "One row per repository, and the share of it you predict is original work — 0.6 means 60% original, 40% carried by dependencies.",
  valueColumn: "originality",
};

const ORIGINALITY_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "repo", title: "repo" },
    { key: "originality", title: "originality" },
  ],
  dataMapper: (row) => ({ repo: row.repo, originality: row.originality }),
  sampleData: sampleOriginalityPredictions,
  filename: "originality-predictions",
};

export const OriginalityMarkets = ({ round = ORIGINALITY_ROUND_2 }: { round?: OriginalityRound }) => {
  const [predictions, setPredictions] = useLocalStorage<OriginalityRow[]>(
    round.predictionsStorageKey,
    [],
  );
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade, isCreated, isUseOldWallet } = useTradeWalletStatus();

  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
    marketIdToRepo,
  } = useProcessOriginalityPredictions(predictions, round);

  // One chart, one line per repository — so every child market is needed at once, and the batch
  // endpoint fetches them in a single request rather than one per repository.
  const chartMarketIds = useMemo(() => Object.keys(marketIdToRepo), [marketIdToRepo]);
  // The withdraw-only view draws no chart, so it asks for none.
  const {
    data: charts,
    isLoading: isLoadingCharts,
    error: chartsError,
  } = useMarketCharts(round.incorrect ? undefined : chartMarketIds);

  // Raw market data for withdraw (React Query will deduplicate with useProcessOriginalityPredictions)
  const { data: originalityMarketData } = useOriginalityMarketsData(round);

  const sellAll = useSellToCollateral();
  const redeem = useRedeemOriginality();

  const closedMarkets = useMemo(
    () =>
      (originalityMarketData?.markets ?? [])
        .filter((m) => m.marketStatus === MarketStatus.CLOSED)
        .map(({ id, collateralToken, wrappedTokens }) => ({ id, collateralToken, wrappedTokens })),
    [originalityMarketData?.markets],
  );

  // Conditional tokens for every closed market — used to detect redeemable
  // balances independently of the per-repo deduped `tableData`, which can
  // drop a closed market's row in favor of an active market for the same repo.
  const closedTokens = useMemo(() => closedMarkets.flatMap((m) => m.wrappedTokens), [closedMarkets]);
  const { data: closedBalances, isLoading: isLoadingClosedBalances } = useTokensBalances(
    tradeExecutor as Address,
    closedTokens,
  );

  // Parent market outcome tokens — redeemable independently of closedTokens when
  // phase 1 (conditional → parent) already ran but phase 2 (parent → sUSDS) hasn't.
  const parentTokens = useMemo(
    () => originalityMarketData?.parentWrappedTokens ?? [],
    [originalityMarketData?.parentWrappedTokens],
  );
  // Only once the parent itself has settled. Minting leaves parent tokens in the wallet — the
  // Invalid leg is never traded — so before that a balance here is an open position, not a claim,
  // and redeeming it reverts.
  const isParentClosed = originalityMarketData?.parentMarketStatus === MarketStatus.CLOSED;
  const redeemableParentTokens = useMemo(
    () => (isParentClosed ? parentTokens : []),
    [isParentClosed, parentTokens],
  );
  const { data: parentBalances, isLoading: isLoadingParentBalances } = useTokensBalances(
    tradeExecutor as Address,
    redeemableParentTokens,
  );

  // The settled markets of the middle level, where the round has one. Their tokens are held
  // outright as well as paid out by a closed repo market: a mint leaves each middle market's
  // Invalid token, and any repo token a trade did not spend.
  const settledMiddleMarkets = useMemo(() => {
    const settled = new Set(
      (originalityMarketData?.middleMarkets ?? [])
        .filter((market) => market.payoutReported)
        .map((market) => market.id.toLowerCase()),
    );
    return (round.middleMarkets ?? []).filter((market) => settled.has(market.marketId.toLowerCase()));
  }, [originalityMarketData?.middleMarkets, round.middleMarkets]);
  const middleTokens = useMemo(
    () => settledMiddleMarkets.flatMap((market) => [...market.wrappedTokens]),
    [settledMiddleMarkets],
  );
  const { data: middleBalances, isLoading: isLoadingMiddleBalances } = useTokensBalances(
    tradeExecutor as Address,
    middleTokens,
  );

  const collateralTokens = useMemo(() => tableData?.map((x) => x.collateralToken), [tableData]);
  const { data: balances, isLoading: isLoadingSellBalances } = useTokensBalances(
    tradeExecutor as Address,
    collateralTokens,
  );

  const withdrawTokens = useMemo(
    () => originalityMarketData?.markets?.map((market) => market.wrappedTokens)?.flat(),
    [originalityMarketData?.markets],
  );

  const chartData = useMemo(() => {
    if (!charts) return undefined;
    return Object.entries(marketIdToRepo).flatMap(([marketId, repo]) => {
      const series = liveSeries(charts[marketId.toLowerCase()])?.[1]; //outcome UP
      return series ? [{ ...series, outcomeName: repo }] : [];
    });
  }, [charts, marketIdToRepo]);

  // A repo market is split against a parent outcome token, not sUSDS. The parent's outcomes (Invalid
  // aside) share one sUSDS between them, so each token is valued at an even share of it. Until the
  // parent's tokens load there is no price, and no figure rather than a wrong one. A round with a
  // middle level states the price itself: its repo tokens are two splits away from sUSDS.
  const unitPrice =
    round.collateralUnitPrice ??
    (parentTokens.length > 1 ? 1 / (parentTokens.length - 1) : undefined);

  const volumeLabel = useMemo(() => {
    const volumes = Object.values(charts ?? {}).flatMap((chart) => chartVolume(chart) ?? []);
    if (!volumes.length || unitPrice === undefined) return undefined;
    const cash = volumes.reduce((acc, curr) => acc + curr.collateral, 0);
    // Same rule as the other aggregate tabs: a sum over a partial set would understate it.
    const tokens = volumes.every((v) => v.tokens !== undefined)
      ? volumes.reduce((acc, curr) => acc + curr.tokens!, 0)
      : undefined;
    return (
      <FigureLabel
        label="Total volume"
        cash={cash}
        tokens={tokens}
        unitPrice={unitPrice}
      />
    );
  }, [charts, unitPrice]);

  // Summed across repositories, matching the volume figure beside it. Each child market is
  // collateralised in its own parent outcome token, all valued at the same share of a sUSDS.
  const liquidityLabel = useMemo(() => {
    const pools = Object.values(charts ?? {}).flatMap((chart) => chartLiquidity(chart) ?? []);
    if (!pools.length || unitPrice === undefined) return undefined;
    const cash = pools.reduce((acc, curr) => acc + curr.collateral, 0);
    return <FigureLabel label="Total liquidity" cash={cash} unitPrice={unitPrice} />;
  }, [charts, unitPrice]);

  const hasMergeAmount = minBigIntArray(balances ?? []) > 0n;
  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.upBalance || x.downBalance)?.length || hasMergeAmount,
    [tableData, hasMergeAmount],
  );

  const hasRedeemable = useMemo(
    () =>
      (closedBalances ?? []).some((b) => b > 0n) ||
      (middleBalances ?? []).some((b) => b > 0n) ||
      (parentBalances ?? []).some((b) => b > 0n),
    [closedBalances, middleBalances, parentBalances],
  );

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading &&
      !isLoadingBalances &&
      !!originalityMarketData &&
      balancesResolved(closedBalances, closedTokens) &&
      balancesResolved(middleBalances, middleTokens) &&
      balancesResolved(parentBalances, redeemableParentTokens),
  });

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.upDifference || row.downDifference).length ?? 0,
    [tableData],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData || !tradeExecutor) return;
    sellAll.mutate({
      tradeExecutor,
      tableData,
      parentMarketId: round.parentMarketId,
      parentInvalidToken: round.parentInvalidToken,
      middleMarkets: round.middleMarkets,
    });
  }, [tableData, sellAll, tradeExecutor, round]);

  const exportWeight = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "repo", title: "repo" },
        { key: "originality", title: "originality" },
      ],
      tableData
        .filter((row) => !row.repo.includes("Invalid result"))
        .map((row) => ({ repo: row.repo, originality: row.upPrice ?? 0 })),
      "originality-weights",
    );
  }, [tableData]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
    <EmptyState
      title="Load your predictions to see your edge"
      description="A CSV of predicted originality per repository, diffed against what the market currently prices."
    >
      <PredictionDropzone
        storageKey={round.predictionsStorageKey}
        loadedCount={0}
        className="w-full max-w-lg"
        compact
        parseFn={parseOriginalityCSV}
        onDataParsed={setPredictions}
      />
    </EmptyState>
    ),
    [setPredictions, round.predictionsStorageKey],
  );

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason = tradeDisabledReason({
    hasPredictions: predictions.length > 0,
    hasDifferences: tradableCount > 0,
    isLoading,
  });

  // Rendered at two sites below (the normal bar and the deprecated-wallet one), so the
  // "nothing to claim" guard lives on the element rather than at either call site.
  const redeemButton = redeemState === "some" && (
    <Button
      size="sm"
      variant="success"
      onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
      disabled={!account}
    >
      Redeem to sUSDS
    </Button>
  );

  // Every round's way out merges matched UP and DOWN tokens back at full value and sells only the
  // rest: putting both sides of every pair into the pools returned about a third as much on the
  // incorrect set. There it is the only action left, so it is named for what it is, a withdraw.
  const sellAllButton = (
    <Button
      size="sm"
      onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
      disabled={!hasSellTokens}
      disabledReason={!hasSellTokens ? "You hold no outcome tokens here." : undefined}
    >
      {round.incorrect ? "Withdraw" : "Sell all positions"}
    </Button>
  );

  const sellAllDialog = (
    <SellAllTokensInterface
      open={isSellAllDialogOpen}
      onOpenChange={setIsSellAllDialogOpen}
      {...(round.incorrect && { title: "Withdraw", confirmLabel: "Withdraw" })}
      {...mergeFirstSellCopy("UP and DOWN")}
      phases={WITHDRAW_PHASES}
      isError={sellAll.isError}
      error={sellAll.error}
      isPending={sellAll.isPending}
      isSuccess={sellAll.isSuccess}
      progress={sellAll.progress}
      reset={sellAll.reset}
      onSellAll={handleSellAll}
      isLoading={isLoadingSellBalances || isLoading || isLoadingBalances}
      hasTokens={hasSellTokens}
    />
  );

  const redeemDialog = (
    <RedeemL2Interface
      open={isRedeemDialogOpen}
      onOpenChange={setIsRedeemDialogOpen}
      isError={redeem.isError}
      error={redeem.error}
      isPending={redeem.isPending}
      isSuccess={redeem.isSuccess}
      progress={redeem.progress}
      reset={redeem.reset}
      onRedeem={() =>
        tradeExecutor &&
        redeem.mutate({
          tradeExecutor,
          closedMarkets,
          parentMarketId: round.parentMarketId,
          parentTokens: redeemableParentTokens,
          middleMarkets: settledMiddleMarkets,
          isOldWallet: isUseOldWallet,
        })
      }
      isLoading={
        isLoadingSellBalances ||
        isLoading ||
        isLoadingBalances ||
        isLoadingClosedBalances ||
        isLoadingMiddleBalances ||
        isLoadingParentBalances
      }
      hasRedeemable={hasRedeemable}
    />
  );

  // An incorrect set is only for getting out of: the two ways out and nothing else. No chart, no
  // predictions, no table — and no Withdraw tokens, which would move outcome tokens to the owner
  // wallet, out of reach of the Withdraw and Redeem buttons that act on the trade wallet.
  if (round.incorrect) {
    const isReadingPositions = isLoading || isLoadingBalances || isLoadingSellBalances;
    const status = !account
      ? "Connect the wallet you traded with to see your positions."
      : !isCreated
        ? "This wallet has no trade wallet, so it holds no positions in these markets."
        : isReadingPositions
          ? "Reading your positions…"
          : hasSellTokens
            ? "You hold positions in these markets."
            : redeemState === "some"
              ? "You hold a payout from these markets."
              : "You hold no positions in these markets.";

    return (
      <>
        <Card className="flex flex-col gap-4 !px-6 !py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-body text-ink-3">{status}</span>
          <div className="flex flex-wrap items-center gap-3 empty:hidden">
            {canTrade && sellAllButton}
            {(canTrade || (isCreated && isUseOldWallet)) && redeemButton}
          </div>
        </Card>
        {sellAllDialog}
        {redeemDialog}
      </>
    );
  }

  return (
    <>
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoadingCharts}
        error={chartsError}
        eyebrow={round.eyebrow}
        title="Share of original work over time"
        description="Each line is a repository's UP price — the market's estimate of how much of it is original."
        volume={volumeLabel}
        liquidity={liquidityLabel}
        refreshMarketIds={chartMarketIds}
      />

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          <>
            {canTrade && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startTransition(() => setIsWithdrawTokensDialogOpen(true))}
                >
                  Withdraw tokens
                </Button>
                {/* Trading stops with the contest; claiming what you already hold does not. */}
                {!finished && sellAllButton}
                {redeemButton}
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
            {isCreated && isUseOldWallet && redeemButton}
          </>
        }
      />

      <OriginalityMarketTable
        markets={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportWeight}
        exportDisabled={!tableData}
      />

      <GenericCSVUpload<OriginalityRow>
        storageKey={round.predictionsStorageKey}
        loadedCount={predictions.length}
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseOriginalityCSV}
        formatInfo={ORIGINALITY_CSV_FORMAT}
        sampleConfig={ORIGINALITY_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <OriginalityTradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          markets={tableData}
          isLoadingBalances={isLoadingBalances}
          parentMarketId={round.parentMarketId}
          middleMarkets={round.middleMarkets}
        />
      )}

      {account && tradeExecutor && (
        <WithdrawOutcomeTokensInterface
          open={isWithdrawTokensDialogOpen}
          onOpenChange={setIsWithdrawTokensDialogOpen}
          account={account}
          tradeExecutor={tradeExecutor}
          tokens={withdrawTokens}
        />
      )}

      {sellAllDialog}

      {redeemDialog}
    </>
  );
};

/** Round 3: same view, over the bundled multi-scalar parent. The bundles never surface here. */
export const OriginalityR3Markets = () => <OriginalityMarkets round={ORIGINALITY_ROUND_3} />;

/** The first round-3 set, built without its middle level. Withdraw-only — see `Round3Withdraw`. */
export const OriginalityR3IncorrectMarkets = () => (
  <OriginalityMarkets round={ORIGINALITY_ROUND_3_INCORRECT} />
);
