import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";
import { useAccount, WagmiProvider } from "wagmi";
import { CSVUpload } from "./components/CSVUpload";
import { MarketTable } from "./components/MarketTable";
import { TradingInterface } from "./components/TradingInterface";
import { WalletConnect } from "./components/WalletConnect";
import { WalletPrompt } from "./components/WalletPrompt";
import { config } from "./config/wagmi";
import { useProcessPredictions } from "./hooks/useProcessPredictions";
import { PredictionRow } from "./types";

const queryClient = new QueryClient();

const AppContent: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const { address: account, isConnected } = useAccount();

  const { data: tableData, isLoading, error } = useProcessPredictions(predictions);
  // Show wallet prompt if not connected
  if (!isConnected || !account) {
    return <WalletPrompt />;
  }

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
            <WalletConnect />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4">
          {/* Header with actions */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Loaded {predictions.length} predictions</h2>
            <div className="flex space-x-4">
              <button
                onClick={handleLoadPredictions}
                className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm font-medium px-4 py-2 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
              >
                {predictions.length > 0 ? "Change Predictions" : "Upload Predictions"}
              </button>
              <button
                onClick={handleStartTrading}
                disabled={
                  !tableData || tableData.filter((x) => x.difference).length === 0 || isLoading
                }
                className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                🚀 Start Trading
              </button>
            </div>
          </div>

          <MarketTable markets={tableData || []} isLoading={isLoading} isConnected={isConnected} />
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <TradingInterface
              account={account}
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
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
