import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { ContestChart } from "@/components/contest/ContestChart";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { Button, EmptyState, ErrorPanel } from "@/components/ui";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL1Predictions } from "@/hooks/useProcessL1Predictions";
import { useSellL1ToCollateral } from "@/hooks/useSellL1ToCollateral";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { PredictionRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { parseCSV } from "@/utils/csvParser";
import { formatAmount } from "@/utils/format";
import { sampleL1Predictions } from "@/utils/sampleL1Predictions";
import { startTransition, useCallback, useMemo, useState } from "react";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { L1MarketTable } from "../L1MarketTable";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { TradingInterface } from "../trade/TradingInterface";

const L1_CSV_FORMAT: CSVFormatInfo = {
  headers: "repo,parent,weight",
  exampleRows: [
    "https://github.com/a16z/helios,ethereum,0.01363775945",
    "https://github.com/ethereum/go-ethereum,ethereum,0.02100000",
  ],
  description: "One row per repository: its URL, its parent ecosystem, and the weight you predict.",
};

const L1_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "repo", title: "repo" },
    { key: "parent", title: "parent" },
    { key: "weight", title: "weight" },
  ],
  dataMapper: (row) => ({
    repo: `https://github.com/${row.item}`,
    parent: "ethereum",
    weight: row.weight,
  }),
  sampleData: sampleL1Predictions,
  filename: "l1-predictions",
};

export const L1Markets = () => {
  const [predictions, setPredictions] = useLocalStorage<PredictionRow[]>("l1-default", []);
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);

  const {
    data: tableData,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
    charts,
    totalVolumeMapping,
  } = useProcessL1Predictions(predictions);

  const sellAll = useSellL1ToCollateral();

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
      (x) =>
        !["invalid result", "other repositories"].some((name) =>
          x.outcomeName.toLowerCase().includes(name),
        ),
    );
  }, [charts]);

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.difference).length ?? 0,
    [tableData],
  );

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((row) => row.currentPrice && row.balance)?.length,
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
        { key: "parent", title: "parent" },
        { key: "weight", title: "weight" },
      ],
      tableData
        .filter(
          (row) => !row.repo.includes("Other repositories") && !row.repo.includes("Invalid result"),
        )
        .map((row) => ({ repo: row.repo, parent: "ethereum", weight: row.currentPrice ?? 0 })),
      "l1-weights",
    );
  }, [tableData]);


  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
    <EmptyState
      title="Load your predictions to see your edge"
      description="A CSV of predicted repository weights, diffed against what the market currently prices."
    >
      <PredictionDropzone
        className="w-full max-w-lg"
        compact
        parseFn={parseCSV}
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
        eyebrow="Round 2 · L1"
        title="Repository weight in the Ethereum ecosystem"
        volume={volumeLabel}
      />

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          canTrade && !finished && (
            <>
              <Button
                size="sm"
                onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
                disabled={!hasSellTokens}
                disabledReason={!hasSellTokens ? "You hold no outcome tokens here." : undefined}
              >
                Sell all positions
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => startTransition(() => setIsTradeDialogOpen(true))}
                disabled={!!disabledReason || !account}
                disabledReason={disabledReason}
              >
                Start trading
              </Button>
            </>
          )
        }
      />

      <L1MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportWeight}
        exportDisabled={!tableData}
      />

      <GenericCSVUpload<PredictionRow>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseCSV}
        formatInfo={L1_CSV_FORMAT}
        sampleConfig={L1_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <TradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          rows={tableData}
        />
      )}

      <SellAllTokensInterface
        open={isSellAllDialogOpen}
        onOpenChange={setIsSellAllDialogOpen}
        description="Swaps every outcome token you hold in this contest back to sUSDS."
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
    </>
  );
};
