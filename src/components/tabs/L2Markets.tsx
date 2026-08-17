import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { Button, EmptyState, ErrorPanel } from "@/components/ui";
import { useL2MarketsData } from "@/hooks/useL2MarketsData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL2Predictions } from "@/hooks/useProcessL2Predictions";
import { useRedeemL2 } from "@/hooks/useRedeemL2";
import { useSellL2ToCollateral } from "@/hooks/useSellL2ToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { L2Row } from "@/types";
import { downloadCsv, isUndefined, minBigIntArray } from "@/utils/common";
import { parseL2CSV } from "@/utils/csvParser";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { sampleL2Predictions } from "@/utils/samepleL2Predictions";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { L2MarketTable } from "../L2MarketTable";
import { L2TradingInterface } from "../trade/L2TradingInterface";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import L2Charts from "./L2Charts";

const L2_CSV_FORMAT: CSVFormatInfo = {
  headers: "dependency,repo,weight",
  exampleRows: [
    "https://github.com/rust-lang/cc-rs,https://github.com/supranational/blst,0.01363775945",
    "https://github.com/eth-clients/holesky,https://github.com/status-im/nimbus-eth2,0.02100000",
  ],
  description:
    "One row per dependency: the dependency, the repository that depends on it, and the weight you predict.",
};

const L2_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "dependency", title: "dependency" },
    { key: "repo", title: "repo" },
    { key: "weight", title: "weight" },
  ],
  dataMapper: (row) => ({ repo: row.repo, dependency: row.dependency, weight: row.weight }),
  sampleData: sampleL2Predictions,
  filename: "l2-predictions",
};

export const L2Markets = () => {
  const [predictions, setPredictions] = useLocalStorage<L2Row[]>("l2-default", []);
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { data: l2Data } = useL2MarketsData();

  const {
    data: tableData,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
    charts,
    totalVolumeMapping,
  } = useProcessL2Predictions(predictions);

  const sellAll = useSellL2ToCollateral();
  const redeem = useRedeemL2();

  const closedMarkets = useMemo(
    () =>
      (l2Data?.markets ?? [])
        .filter((m) => m.marketStatus === MarketStatus.CLOSED)
        .map(({ id, collateralToken, wrappedTokens }) => ({ id, collateralToken, wrappedTokens })),
    [l2Data?.markets],
  );

  const closedMarketIds = useMemo(
    () => new Set(closedMarkets.map((m) => m.id.toLowerCase())),
    [closedMarkets],
  );

  const collateralTokens = useMemo(
    () => Array.from(new Set(tableData?.map((x) => x.collateralToken) ?? [])),
    [tableData],
  );

  const { data: balances, isLoading: isLoadingSellBalances } = useTokensBalances(
    tradeExecutor as Address,
    collateralTokens,
  );

  // Parent market outcome tokens — redeemable independently of closed markets when
  // phase 1 (conditional → parent) already ran but phase 2 (parent → sUSDS) hasn't.
  const { data: parentBalances, isLoading: isLoadingParentBalances } = useTokensBalances(
    tradeExecutor as Address,
    l2MarketOutcomes as Address[],
  );

  const repoOptions = useMemo(
    () =>
      tableData
        ? Array.from(
            new Map(tableData.map((x) => [x.repo, { text: x.repo, id: x.marketId }])).values(),
          ).sort((a, b) => (a.text.toLowerCase() > b.text.toLowerCase() ? 1 : -1))
        : [],
    [tableData],
  );

  const hasMergeAmount = minBigIntArray(balances ?? []) > 0n;
  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.balance)?.length || hasMergeAmount,
    [tableData, hasMergeAmount],
  );

  const hasRedeemable = useMemo(
    () =>
      !!tableData?.some(
        (row) => closedMarketIds.has(row.marketId.toLowerCase()) && (row.balance ?? 0n) > 0n,
      ) || (parentBalances ?? []).some((b) => b > 0n),
    [tableData, closedMarketIds, parentBalances],
  );

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.difference).length ?? 0,
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
        { key: "dependency", title: "dependency" },
        { key: "repo", title: "repo" },
        { key: "weight", title: "weight" },
      ],
      tableData
        .filter((row) => !row.dependency.includes("Invalid result"))
        .map((row) => ({
          repo: row.repo,
          dependency: row.dependency,
          weight: row.currentPrice ?? 0,
        })),
      "l2-weights",
    );
  }, [tableData]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
    <EmptyState
      title="Load your predictions to see your edge"
      description="A CSV of predicted dependency weights, diffed against what the market currently prices."
    >
      <PredictionDropzone
        className="w-full max-w-lg"
        compact
        parseFn={parseL2CSV}
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

  return (
    <>
      <L2Charts
        repoOptions={repoOptions}
        charts={isUndefined(charts) ? undefined : charts}
        totalVolumeMapping={totalVolumeMapping ?? undefined}
        isLoading={isLoading || isFetching}
      />

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          canTrade && (
            <>
              {/* Trading stops with the contest; claiming what you already hold does not. */}
              {!finished && (
                <Button
                  size="sm"
                  onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
                  disabled={!tableData || isLoading || !account}
                  disabledReason={isLoading ? "Waiting for market data." : undefined}
                >
                  Sell all positions
                </Button>
              )}
              <Button
                size="sm"
                variant="success"
                onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
                disabled={isLoading || !account}
                disabledReason={isLoading ? "Waiting for market data." : undefined}
              >
                Redeem to sUSDS
              </Button>
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
          )
        }
      />

      <L2MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportWeight}
        exportDisabled={!tableData}
      />

      <GenericCSVUpload<L2Row>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseL2CSV}
        formatInfo={L2_CSV_FORMAT}
        sampleConfig={L2_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <L2TradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          rows={tableData}
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
        onRedeem={() => tradeExecutor && redeem.mutate({ tradeExecutor, closedMarkets })}
        isLoading={
          isLoadingSellBalances || isLoading || isLoadingBalances || isLoadingParentBalances
        }
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
