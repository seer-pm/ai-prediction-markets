import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL1Predictions } from "@/hooks/useProcessL1Predictions";
import { useSellL1ToCollateral } from "@/hooks/useSellL1ToCollateral";
import { DownloadIcon } from "@/lib/icons";
import { PredictionRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { parseCSV } from "@/utils/csvParser";
import { sampleL1Predictions } from "@/utils/sampleL1Predictions";
import { startTransition, useCallback, useMemo, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { L1MarketTable } from "../L1MarketTable";
import MarketChart from "../MarketChart";
import { Modal } from "../Modal";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { TradingInterface } from "../trade/TradingInterface";
import { useWalletStore } from "@/stores/walletStore";

const L1_CSV_FORMAT: CSVFormatInfo = {
  headers: "repo,parent,weight",
  exampleRows: [
    "https://github.com/a16z/helios,ethereum,0.01363775945",
    "https://github.com/ethereum/go-ethereum,ethereum,0.02100000",
  ],
  description:
    "Each row represents a prediction for a repository's weight in the Ethereum ecosystem",
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
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<PredictionRow[]>("l1-default", []);

  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);

  const {
    data: tableData,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
    charts,
    totalVolumeMapping,
  } = useProcessL1Predictions(predictions);

  const sellAll = useSellL1ToCollateral(() => {
    closeSellAllDialog();
  });

  const parseL1VolumeData = useCallback(() => {
    const volumeString = Object.values(totalVolumeMapping ?? {})[0];
    if (!volumeString) return "";
    const [volume] = volumeString.split(" ");
    return (
      <>
        Total volume: <span className="font-semibold">{Number(volume).toFixed(2)} sUSDS</span>
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

  const volumeLabel = useMemo(() => parseL1VolumeData(), [parseL1VolumeData]);

  const handleDataParsed = (data: PredictionRow[]) => {
    setPredictions(data);
  };

  const handleStartTrading = useCallback(() => {
    startTransition(() => setIsTradeDialogOpen(true));
  }, []);

  const handleLoadPredictions = useCallback(() => {
    startTransition(() => setIsCsvDialogOpen(true));
  }, []);

  const closeCsvDialog = useCallback(() => startTransition(() => setIsCsvDialogOpen(false)), []);
  const closeTradeDialog = useCallback(() => startTransition(() => setIsTradeDialogOpen(false)), []);
  const closeSellAllDialog = useCallback(() => startTransition(() => setIsSellAllDialogOpen(false)), []);

  const handleSellAll = useCallback(() => {
    if (!tableData) return;
    sellAll.mutate({ tradeExecutor: checkTradeExecutorResult?.predictedAddress!, tableData });
  }, [tableData, sellAll, checkTradeExecutorResult?.predictedAddress]);

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.currentPrice && x.balance)?.length,
    [tableData],
  );

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
        .map((row) => ({
          repo: row.repo,
          parent: "ethereum",
          weight: row.currentPrice ?? 0,
        })),
      "l1-weights",
    );
  }, [tableData]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">Error loading market data: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-5 drop-shadow bg-white rounded-lg">
        {!isUndefined(chartData) ? (
          <MarketChart data={chartData!} totalVolumeMarket={volumeLabel} />
        ) : (
          <>
            {isLoading || isFetching ? (
              <div className="animate-pulse">
                <div className="h-40 bg-gray-300 rounded"></div>
              </div>
            ) : (
              <p>No Chart Data</p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          {predictions.length > 0 && (
            <button
              onClick={() => startTransition(() => setPredictions([]))}
              className="cursor-pointer text-red-600 hover:text-red-800 text-sm font-medium px-4 py-2 border border-red-300 rounded-md hover:bg-red-50 transition-colors w-full sm:w-auto text-center"
            >
              Clear Predictions
            </button>
          )}

          <button
            onClick={handleLoadPredictions}
            className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm font-medium px-4 py-2 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors w-full sm:w-auto text-center"
          >
            {predictions.length > 0 ? "Change Predictions" : "Upload Predictions"}
          </button>

          {checkTradeExecutorResult?.isCreated && !isUseOldWallet && (
            <>
              <button
                onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
                className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
              >
                Sell all to sUSDS
              </button>

              <button
                onClick={handleStartTrading}
                disabled={
                  !tableData ||
                  tableData.filter((x) => x.difference).length === 0 ||
                  isLoading ||
                  !account ||
                  !checkTradeExecutorResult?.isCreated
                }
                className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium w-full sm:w-auto text-center"
              >
                🚀 Start Trading
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold">Loaded {predictions.length} predictions</h2>
        {tableData && (
          <button
            className="hover:underline hover:opacity-70 cursor-pointer flex gap-1"
            onClick={() => exportWeight()}
          >
            <DownloadIcon />
            <p>Export current weight</p>
          </button>
        )}
      </div>

      <L1MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />

      {/* CSV Dialog */}
      <Modal isOpen={isCsvDialogOpen} onClose={closeCsvDialog} maxWidth="max-w-2xl">
        <GenericCSVUpload<PredictionRow>
          onDataParsed={handleDataParsed}
          onClose={closeCsvDialog}
          parseFn={parseCSV}
          formatInfo={L1_CSV_FORMAT}
          sampleConfig={L1_SAMPLE_CONFIG}
        />
      </Modal>

      {/* Trading Dialog */}
      <Modal isOpen={isTradeDialogOpen && !!tableData} onClose={closeTradeDialog}>
        {tableData && (
          <TradingInterface
            tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
            rows={tableData}
            onClose={closeTradeDialog}
          />
        )}
      </Modal>

      {/* Sell All Dialog */}
      <Modal isOpen={isSellAllDialogOpen} onClose={closeSellAllDialog}>
        <SellAllTokensInterface
          onClose={closeSellAllDialog}
          subtitle="Sell all positions to sUSDS using direct swaps"
          isError={sellAll.isError}
          error={sellAll.error}
          isPending={sellAll.isPending}
          txState={sellAll.txState}
          reset={sellAll.reset}
          onSellAll={handleSellAll}
          isLoading={isLoading || isLoadingBalances}
          hasTokens={hasSellTokens}
        />
      </Modal>
    </>
  );
};
