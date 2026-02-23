import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL1Predictions } from "@/hooks/useProcessL1Predictions";
import { PredictionRow } from "@/types";
import { useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { CSVUpload } from "../CSVUpload";
import { L1MarketTable } from "../L1MarketTable";
import { SellAllL1TokensInterface } from "../trade/SellAllL1TokensInterface";
import { TradingInterface } from "../trade/TradingInterface";

export const L1Markets = () => {
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<PredictionRow[]>("l1-default", []);

  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);

  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
  } = useProcessL1Predictions(predictions);

  const handleDataParsed = (data: PredictionRow[]) => {
    setPredictions(data);
  };

  const handleStartTrading = () => {
    setIsTradeDialogOpen(true);
  };

  const handleLoadPredictions = () => {
    setIsCsvDialogOpen(true);
  };
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
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          {predictions.length > 0 && (
            <button
              onClick={() => setPredictions([])}
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

          <button
            onClick={() => setIsSellAllDialogOpen(true)}
            className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
          >
            Sell all to sUSDS
          </button>
          {checkTradeExecutorResult?.isCreated && (
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
          )}
        </div>
      </div>
      <h2 className="text-xl font-semibold">Loaded {predictions.length} predictions</h2>

      <L1MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />
      {/* CSv Dialog */}
      {isCsvDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <CSVUpload onDataParsed={handleDataParsed} onClose={() => setIsCsvDialogOpen(false)} />
          </div>
        </div>
      )}

      {/* Trading Dialog */}
      {isTradeDialogOpen && tableData && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <TradingInterface
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              rows={tableData}
              onClose={() => setIsTradeDialogOpen(false)}
            />
          </div>
        </div>
      )}

      {isSellAllDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <SellAllL1TokensInterface
              rows={tableData}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsSellAllDialogOpen(false)}
              isLoadingTable={isLoading || isLoadingBalances}
            />
          </div>
        </div>
      )}
    </>
  );
};
