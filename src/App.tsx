import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React, { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAccount, useDisconnect, WagmiProvider } from "wagmi";
import { CSVUpload } from "./components/CSVUpload";
import Footer from "./components/Footer";
import { MarketTable } from "./components/MarketTable";
import { TradeWallet } from "./components/trade/TradeWallet";
import { TradingInterface } from "./components/trade/TradingInterface";
import { WalletConnect } from "./components/WalletConnect";
import Web3ButtonWrapper from "./components/Web3ButtonWrapper";
import { localStoragePersister, queryClient } from "./config/queryClient";
import { config } from "./config/wagmi";
import { useCheckTradeExecutorCreated } from "./hooks/useCheckTradeExecutorCreated";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useProcessPredictions } from "./hooks/useProcessPredictions";
import { PredictionRow } from "./types";

const AppContent: React.FC = () => {
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<PredictionRow[]>(
    account ? `predictions-${account}` : "predictions-default",
    []
  );

  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);

  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const { disconnect } = useDisconnect({
    mutation: {
      onSuccess() {
        setPredictions([]);
      },
    },
  });

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
  } = useProcessPredictions(predictions);

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
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">AI Prediction Markets</h1>
            <WalletConnect disconnect={disconnect} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4 mb-20">
          <TradeWallet />
          {/* Header with actions */}
          {checkTradeExecutorResult?.isCreated && (
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                Loaded {predictions.length} predictions •
                {predictions.length === 0 && (
                  <span className="text-sm text-blue-600 ml-2">
                    Upload your predictions to trade
                  </span>
                )}
              </h2>
              <div className="flex space-x-4">
                {predictions.length > 0 && (
                  <button
                    onClick={() => setPredictions([])}
                    className="cursor-pointer text-red-600 hover:text-red-800 text-sm font-medium px-4 py-2 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Clear Predictions
                  </button>
                )}
                <Web3ButtonWrapper>
                  <button
                    onClick={handleLoadPredictions}
                    className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm font-medium px-4 py-2 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
                  >
                    {predictions.length > 0 ? "Change Predictions" : "Upload Predictions"}
                  </button>
                </Web3ButtonWrapper>
                <button
                  onClick={handleStartTrading}
                  disabled={
                    !tableData ||
                    tableData.filter((x) => x.difference).length === 0 ||
                    isLoading ||
                    !account ||
                    !checkTradeExecutorResult?.isCreated
                  }
                  className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  🚀 Start Trading
                </button>
              </div>
            </div>
          )}

          <MarketTable
            markets={tableData || []}
            isLoading={isLoading}
            isLoadingBalances={isLoadingBalances}
          />
          <div className="mx-auto p-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg text-white">
            <h3 className="text-lg font-semibold mb-3">Want More Trading Power?</h3>
            <p className="text-sm leading-relaxed opacity-95 mb-4">
              Check out the full Seer platform for advanced trading features — trade individual
              markets, provide liquidity, and access detailed market analytics.
            </p>
            <a
              href="https://app.seer.pm/markets/10/what-will-be-the-juror-weight-computed-through-huber-loss-minimization-in-the-lo-2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-5 py-2.5 bg-opacity-20 backdrop-blur-sm border border-white border-opacity-30 rounded-lg text-sm font-medium hover:bg-opacity-30 transition-all duration-200 no-underline"
            >
              Visit AI Prediction Markets on Seer →
            </a>
          </div>
        </div>
      </main>

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
              markets={tableData}
              onClose={() => setIsTradeDialogOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <WagmiProvider config={config}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: localStoragePersister }}
      >
        <ToastContainer />
        <AppContent />
        <Footer />
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
