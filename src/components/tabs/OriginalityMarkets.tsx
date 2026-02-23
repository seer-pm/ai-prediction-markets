import { OriginalityCSVUpload } from "@/components/OriginalityCSVUpload";
import { OriginalityMarketTable } from "@/components/OriginalityMarketTable";
import { OriginalityTradingInterface } from "@/components/trade/OriginalityTradingInterface";
import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessOriginalityPredictions } from "@/hooks/useProcessOriginalityPredictions";
import { OriginalityRow } from "@/types";
import { useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { SellAllOriginalityTokensInterface } from "../trade/SellAllOriginalityTokensInterface";
import { WithdrawOriginalityTokensInterface } from "../trade/WithdrawOriginalityTokensInterface";

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

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
  } = useProcessOriginalityPredictions(predictions);

  const handleDataParsed = (data: OriginalityRow[]) => {
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
            onClick={() => setIsWithdrawTokensDialogOpen(true)}
            className="cursor-pointer px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
          >
            Withdraw outcome tokens
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
                tableData.filter((x) => x.upDifference || x.downDifference).length === 0 ||
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

      <OriginalityMarketTable
        markets={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />
      {/* CSv Dialog */}
      {isCsvDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <OriginalityCSVUpload
              onDataParsed={handleDataParsed}
              onClose={() => setIsCsvDialogOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Trading Dialog */}
      {isTradeDialogOpen && tableData && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <OriginalityTradingInterface
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              markets={tableData}
              onClose={() => setIsTradeDialogOpen(false)}
            />
          </div>
        </div>
      )}
      {isWithdrawTokensDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <WithdrawOriginalityTokensInterface
              account={account!}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsWithdrawTokensDialogOpen(false)}
            />
          </div>
        </div>
      )}
      {isSellAllDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <SellAllOriginalityTokensInterface
              markets={tableData}
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
