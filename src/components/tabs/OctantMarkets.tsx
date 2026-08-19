import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { ContestChart } from "@/components/contest/ContestChart";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { Button, EmptyState, ErrorPanel } from "@/components/ui";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOctantMarketsData } from "@/hooks/useOctantMarketsData";
import { useProcessOctantPredictions } from "@/hooks/useProcessOctantPredictions";
import { useRedeemOctant } from "@/hooks/useRedeemOctant";
import { useSellOctantToCollateral } from "@/hooks/useSellOctantToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { OctantRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { parseOctantCSV } from "@/utils/csvParser";
import { formatAmount, formatPercent } from "@/utils/format";
import { sampleOctantPredictions } from "@/utils/sampleOctantPredictions";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { OctantMarketTable } from "../OctantMarketTable";
import { OctantTradingInterface } from "../trade/OctantTradingInterface";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";

const OCTANT_CSV_FORMAT: CSVFormatInfo = {
  headers: "project,percent",
  exampleRows: ["Protocol Guild,13.27", "Solidity,12.58"],
  description: "One row per project: its name, and the share of the round you predict (0–100).",
};

const OCTANT_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "project", title: "project" },
    { key: "percent", title: "percent" },
  ],
  dataMapper: (row) => ({ project: row.project, percent: row.percent }),
  sampleData: sampleOctantPredictions,
  filename: "octant-predictions",
};

// Module scope so the memoised chart isn't handed a new function each render.
const formatOctantShare = (value: number) => `${formatPercent(value * 100)}%`;

export const OctantMarkets = () => {
  const [predictions, setPredictions] = useLocalStorage<OctantRow[]>("octant-default", []);
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

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
    totalVolumeMapping,
  } = useProcessOctantPredictions(predictions);

  const sellAll = useSellOctantToCollateral();
  const redeem = useRedeemOctant();

  // Redeem needs the outcome tokens in outcome order — `tableData` is sorted by
  // price, so the row index no longer matches the on-chain outcome index.
  // React Query dedupes both of these with useProcessOctantPredictions.
  const { data: octantMarketData } = useOctantMarketsData();
  const wrappedTokens = useMemo(
    () => (octantMarketData?.wrappedTokens ?? []) as Address[],
    [octantMarketData?.wrappedTokens],
  );
  const { data: outcomeBalances, isLoading: isLoadingOutcomeBalances } = useTokensBalances(
    tradeExecutor as Address,
    wrappedTokens,
  );

  const hasRedeemable = useMemo(
    () =>
      octantMarketData?.marketStatus === MarketStatus.CLOSED &&
      (outcomeBalances ?? []).some((b) => b > 0n),
    [octantMarketData?.marketStatus, outcomeBalances],
  );

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading &&
      !isLoadingBalances &&
      octantMarketData?.marketStatus !== undefined &&
      balancesResolved(outcomeBalances, wrappedTokens),
  });

  const volumeLabel = useMemo(() => {
    const volumeString = Object.values(totalVolumeMapping ?? {})[0];
    if (!volumeString) return undefined;
    const [volume] = volumeString.split(" ");
    return (
      <>
        Volume <span className="font-mono text-ink">{formatAmount(Number(volume))} sUSDS</span>
      </>
    );
  }, [totalVolumeMapping]);

  const chartData = useMemo(() => {
    if (!charts) return undefined;
    return Object.values(charts)[0].filter(
      (x) => !x.outcomeName.toLowerCase().includes("invalid result"),
    );
  }, [charts]);

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.difference).length ?? 0,
    [tableData],
  );

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.currentPrice && x.balance)?.length,
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
        { key: "project", title: "project" },
        { key: "percent", title: "percent" },
      ],
      tableData
        .filter((row) => !row.repo.includes("Invalid result"))
        .map((row) => ({ project: row.repo, percent: (row.currentPrice ?? 0) * 100 })),
      "octant-weights",
    );
  }, [tableData]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
    <EmptyState
      title="Load your predictions to see your edge"
      description="A CSV of predicted funding shares, diffed against what the market currently prices."
    >
      <PredictionDropzone
        className="w-full max-w-lg"
        compact
        parseFn={parseOctantCSV}
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
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoading || isFetching}
        eyebrow="Octant"
        title="Project funding share over time"
        volume={volumeLabel}
        formatValue={formatOctantShare}
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
                  disabled={!hasSellTokens}
                  disabledReason={!hasSellTokens ? "You hold no outcome tokens here." : undefined}
                >
                  Sell all positions
                </Button>
              )}
              {redeemState !== "none" && (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
                  disabled={redeemState === "unknown" || !account}
                  disabledReason={
                    redeemState === "unknown" ? "Checking what you can claim." : undefined
                  }
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
          )
        }
      />

      <OctantMarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportWeight}
        exportDisabled={!tableData}
      />

      <GenericCSVUpload<OctantRow>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseOctantCSV}
        formatInfo={OCTANT_CSV_FORMAT}
        sampleConfig={OCTANT_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <OctantTradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          rows={tableData}
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
        onRedeem={() =>
          tradeExecutor && redeem.mutate({ tradeExecutor, wrappedTokens })
        }
        isLoading={isLoading || isLoadingBalances || isLoadingOutcomeBalances}
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
