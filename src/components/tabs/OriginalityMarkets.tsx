import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { ContestChart } from "@/components/contest/ContestChart";
import { OriginalityMarketTable } from "@/components/OriginalityMarketTable";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { OriginalityTradingInterface } from "@/components/trade/OriginalityTradingInterface";
import { Button, EmptyState, ErrorPanel } from "@/components/ui";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOriginalityMarketsData } from "@/hooks/useOriginalityMarketsData";
import { useProcessOriginalityPredictions } from "@/hooks/useProcessOriginalityPredictions";
import { useRedeemOriginality } from "@/hooks/useRedeemOriginality";
import { useSellToCollateral } from "@/hooks/useSellToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { OriginalityRow } from "@/types";
import { downloadCsv, isUndefined, minBigIntArray } from "@/utils/common";
import { parseOriginalityCSV } from "@/utils/csvParser";
import { formatAmount } from "@/utils/format";
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

export const OriginalityMarkets = () => {
  const [predictions, setPredictions] = useLocalStorage<OriginalityRow[]>(
    "originality-default",
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
    isFetching,
    isLoadingBalances,
    error,
    charts,
    marketIdToRepo,
    totalVolumeMapping,
  } = useProcessOriginalityPredictions(predictions);

  // Raw market data for withdraw (React Query will deduplicate with useProcessOriginalityPredictions)
  const { data: originalityMarketData } = useOriginalityMarketsData();

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
  const { data: parentBalances, isLoading: isLoadingParentBalances } = useTokensBalances(
    tradeExecutor as Address,
    parentTokens,
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
    return Object.entries(charts).map(([marketId, chartWithMarketData]) => {
      const { poolHourDatas, collateral, outcomeId } = chartWithMarketData[1]; //outcome UP
      return {
        poolHourDatas,
        outcomeName: marketIdToRepo[marketId],
        collateral,
        marketId,
        outcomeId,
      };
    });
  }, [charts, marketIdToRepo]);

  const volumeLabel = useMemo(() => {
    if (!totalVolumeMapping) return undefined;
    const entries = Object.values(totalVolumeMapping);
    if (!entries.length) return undefined;
    const average =
      entries.reduce((acc, curr) => acc + Number(curr.split(" ")[0]), 0) / entries.length;
    return (
      <>
        Average volume per repository{" "}
        <span className="font-mono text-ink">{formatAmount(average)} sUSDS</span>
      </>
    );
  }, [totalVolumeMapping]);

  const hasMergeAmount = minBigIntArray(balances ?? []) > 0n;
  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.upBalance || x.downBalance)?.length || hasMergeAmount,
    [tableData, hasMergeAmount],
  );

  const hasRedeemable = useMemo(
    () => (closedBalances ?? []).some((b) => b > 0n) || (parentBalances ?? []).some((b) => b > 0n),
    [closedBalances, parentBalances],
  );

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.upDifference || row.downDifference).length ?? 0,
    [tableData],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData || !tradeExecutor) return;
    sellAll.mutate({ tradeExecutor, tableData });
  }, [tableData, sellAll, tradeExecutor]);

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
        className="w-full max-w-lg"
        compact
        parseFn={parseOriginalityCSV}
        onDataParsed={setPredictions}
      />
    </EmptyState>
    ),
    [setPredictions],
  );

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason = tradeDisabledReason({
    hasPredictions: predictions.length > 0,
    hasDifferences: tradableCount > 0,
    isLoading,
  });

  const redeemButton = (
    <Button
      size="sm"
      variant="success"
      onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
      disabled={isLoading || !account}
      disabledReason={isLoading ? "Waiting for market data." : undefined}
    >
      Redeem to sUSDS
    </Button>
  );

  return (
    <>
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoading || isFetching}
        eyebrow="Round 2 · Originality"
        title="Share of original work over time"
        description="Each line is a repository's UP price — the market's estimate of how much of it is original."
        volume={volumeLabel}
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

      <SellAllTokensInterface
        open={isSellAllDialogOpen}
        onOpenChange={setIsSellAllDialogOpen}
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
            parentTokens,
            isOldWallet: isUseOldWallet,
          })
        }
        isLoading={
          isLoadingSellBalances ||
          isLoading ||
          isLoadingBalances ||
          isLoadingClosedBalances ||
          isLoadingParentBalances
        }
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
