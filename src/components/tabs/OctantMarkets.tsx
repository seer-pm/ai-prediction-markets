import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessOctantPredictions } from "@/hooks/useProcessOctantPredictions";
import { useSellOctantToCollateral } from "@/hooks/useSellOctantToCollateral";
import { DownloadIcon } from "@/lib/icons";
import { OctantRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { parseOctantCSV } from "@/utils/csvParser";
import { sampleOctantPredictions } from "@/utils/sampleOctantPredictions";
import { startTransition, useCallback, useMemo, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { OctantMarketTable } from "../OctantMarketTable";
import MarketChart from "../MarketChart";
import { Modal } from "../Modal";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { OctantTradingInterface } from "../trade/OctantTradingInterface";
import { useWalletStore } from "@/stores/walletStore";

const OCTANT_CSV_FORMAT: CSVFormatInfo = {
  headers: "project,percent",
  exampleRows: ["Protocol Guild,13.27", "Solidity,12.58"],
  description:
    "Each row represents a prediction for a project's percentage share (0-100) in the Octant market",
};

const OCTANT_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "project", title: "project" },
    { key: "percent", title: "percent" },
  ],
  dataMapper: (row) => ({
    project: row.project,
    percent: row.percent,
  }),
  sampleData: sampleOctantPredictions,
  filename: "octant-predictions",
};

export const OctantMarkets = () => {
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<OctantRow[]>("octant-default", []);

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
  } = useProcessOctantPredictions(predictions);

  const sellAll = useSellOctantToCollateral(() => {
    closeSellAllDialog();
  });

  const parseOctantVolumeData = useCallback(() => {
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
      (x) => !x.outcomeName.toLowerCase().includes("invalid result"),
    );
  }, [charts]);

  const volumeLabel = useMemo(() => parseOctantVolumeData(), [parseOctantVolumeData]);

  const handleDataParsed = (data: OctantRow[]) => {
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
  const closeSellAllDialog = useCallback(
    () => startTransition(() => setIsSellAllDialogOpen(false)),
    [],
  );

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
        { key: "project", title: "project" },
        { key: "percent", title: "percent" },
      ],
      tableData
        .filter((row) => !row.repo.includes("Invalid result"))
        .map((row) => ({
          project: row.repo,
          percent: (row.currentPrice ?? 0) * 100,
        })),
      "octant-weights",
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

      <OctantMarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />

      {/* CSV Dialog */}
      <Modal isOpen={isCsvDialogOpen} onClose={closeCsvDialog} maxWidth="max-w-2xl">
        <GenericCSVUpload<OctantRow>
          onDataParsed={handleDataParsed}
          onClose={closeCsvDialog}
          parseFn={parseOctantCSV}
          formatInfo={OCTANT_CSV_FORMAT}
          sampleConfig={OCTANT_SAMPLE_CONFIG}
        />
      </Modal>

      {/* Trading Dialog */}
      <Modal isOpen={isTradeDialogOpen && !!tableData} onClose={closeTradeDialog}>
        {tableData && (
          <OctantTradingInterface
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
