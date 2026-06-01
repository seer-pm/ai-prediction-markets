import { OriginalityMarketTable } from "@/components/OriginalityMarketTable";
import { OriginalityTradingInterface } from "@/components/trade/OriginalityTradingInterface";
import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOriginalityMarketsData } from "@/hooks/useOriginalityMarketsData";
import { useProcessOriginalityPredictions } from "@/hooks/useProcessOriginalityPredictions";
import { useSellToCollateral } from "@/hooks/useSellToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { OriginalityRow } from "@/types";
import { startTransition, useCallback, useMemo, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { Address } from "viem";
import { WithdrawOutcomeTokensInterface } from "../trade/WithdrawOutcomeTokensInterface";
import { downloadCsv, isUndefined, minBigIntArray } from "@/utils/common";
import { DownloadIcon } from "@/lib/icons";
import MarketChart from "../MarketChart";
import { useWalletStore } from "@/stores/walletStore";
import { Modal } from "../Modal";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { parseOriginalityCSV } from "@/utils/csvParser";
import { sampleOriginalityPredictions } from "@/utils/sampleOriginalityPredictions";

const ORIGINALITY_CSV_FORMAT: CSVFormatInfo = {
  headers: "repo,originality",
  exampleRows: [
    "https://github.com/a16z/helios,0.5",
    "https://github.com/ethereum/go-ethereum,0.15",
  ],
  description:
    "Each row represents a prediction for how original is the repository (0.6 would mean 60% is original work and 40% is based on dependencies)",
};

const ORIGINALITY_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "repo", title: "repo" },
    { key: "originality", title: "originality" },
  ],
  dataMapper: (row) => ({
    repo: row.repo,
    originality: row.originality,
  }),
  sampleData: sampleOriginalityPredictions,
  filename: "originality-predictions",
};

export const OriginalityMarkets = () => {
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<OriginalityRow[]>(
    "originality-default",
    [],
  );

  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
    charts,
    marketIdToRepo,
    totalVolumeMapping,
  } = useProcessOriginalityPredictions(predictions);

  // Raw market data for withdraw (React Query will deduplicate with useProcessOriginalityPredictions)
  const { data: originalityMarketData } = useOriginalityMarketsData();

  const sellAll = useSellToCollateral(() => {
    closeSellAllDialog();
  });

  const collateralTokens = useMemo(
    () => tableData?.map((x) => x.collateralToken),
    [tableData],
  );
  const { data: balances, isLoading: isLoadingSellBalances } = useTokensBalances(
    checkTradeExecutorResult?.predictedAddress as Address,
    collateralTokens,
  );

  // Tokens for withdraw dialog
  const withdrawTokens = useMemo(
    () => originalityMarketData?.markets?.map((market) => market.wrappedTokens)?.flat(),
    [originalityMarketData?.markets],
  );

  const parseOriginalityChartData = useCallback(() => {
    if (!charts) return null;
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

  const parseOriginalityVolumeData = useCallback(() => {
    if (!totalVolumeMapping) return "";
    const volume =
      Object.values(totalVolumeMapping).reduce((acc, curr) => {
        const volume = Number(curr.split(" ")[0]);
        return acc + volume;
      }, 0) / Object.values(totalVolumeMapping).length;
    return (
      <>
        Average volume per underlying: <span className="font-semibold">{volume.toFixed(2)}</span>
      </>
    );
  }, [totalVolumeMapping]);

  const parsedData = useMemo(() => parseOriginalityChartData(), [parseOriginalityChartData]);

  const handleDataParsed = (data: OriginalityRow[]) => {
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
  const closeWithdrawTokensDialog = useCallback(
    () => startTransition(() => setIsWithdrawTokensDialogOpen(false)),
    [],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData) return;
    sellAll.mutate({ tradeExecutor: checkTradeExecutorResult?.predictedAddress!, tableData });
  }, [tableData, sellAll, checkTradeExecutorResult?.predictedAddress]);

  const hasMergeAmount = minBigIntArray(balances ?? []) > 0n;
  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.upBalance || x.downBalance)?.length || hasMergeAmount,
    [tableData, hasMergeAmount],
  );

  const exportWeight = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "repo", title: "repo" },
        { key: "originality", title: "originality" },
      ],
      tableData
        .filter((row) => !row.repo.includes("Invalid result"))
        .map((row) => ({
          repo: row.repo,
          originality: row.upPrice ?? 0,
        })),
      "originality-weights",
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
        {!isUndefined(parsedData) ? (
          <MarketChart data={parsedData} totalVolumeMarket={parseOriginalityVolumeData()} />
        ) : (
          <>
            {isLoading ? (
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
                onClick={() => startTransition(() => setIsWithdrawTokensDialogOpen(true))}
                className="cursor-pointer px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
              >
                Withdraw outcome tokens
              </button>
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
                  tableData.filter((x) => x.upDifference || x.downDifference).length === 0 ||
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

      <OriginalityMarketTable
        markets={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />

      {/* CSV Dialog */}
      <Modal isOpen={isCsvDialogOpen} onClose={closeCsvDialog} maxWidth="max-w-2xl">
        <GenericCSVUpload<OriginalityRow>
          onDataParsed={handleDataParsed}
          onClose={closeCsvDialog}
          parseFn={parseOriginalityCSV}
          formatInfo={ORIGINALITY_CSV_FORMAT}
          sampleConfig={ORIGINALITY_SAMPLE_CONFIG}
        />
      </Modal>

      {/* Trading Dialog */}
      <Modal isOpen={isTradeDialogOpen && !!tableData} onClose={closeTradeDialog}>
        {tableData && (
          <OriginalityTradingInterface
            tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
            markets={tableData}
            onClose={closeTradeDialog}
          />
        )}
      </Modal>

      {/* Withdraw Dialog */}
      <Modal isOpen={isWithdrawTokensDialogOpen} onClose={closeWithdrawTokensDialog}>
        <WithdrawOutcomeTokensInterface
          account={account!}
          tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
          onClose={closeWithdrawTokensDialog}
          tokens={withdrawTokens}
        />
      </Modal>

      {/* Sell All Dialog */}
      <Modal isOpen={isSellAllDialogOpen} onClose={closeSellAllDialog}>
        <SellAllTokensInterface
          onClose={closeSellAllDialog}
          subtitle="Sell all positions to sUSDS"
          isError={sellAll.isError}
          error={sellAll.error}
          isPending={sellAll.isPending}
          txState={sellAll.txState}
          reset={sellAll.reset}
          onSellAll={handleSellAll}
          isLoading={isLoadingSellBalances || isLoading || isLoadingBalances}
          hasTokens={hasSellTokens}
        />
      </Modal>
    </>
  );
};
