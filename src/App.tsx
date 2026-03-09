import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React, { useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { WagmiProvider } from "wagmi";
import Footer from "./components/Footer";
import { TradeWallet } from "./components/trade/TradeWallet";
import { WalletConnect } from "./components/WalletConnect";
import { localStoragePersister, queryClient } from "./config/queryClient";
import { config } from "./config/wagmi";
import { Tab } from "./components/Tab";
import { OldTradeWallet } from "./components/trade/OldTradeWallet";
import { SessionKeyManager, withdrawFundSessionKey } from "./lib/on-chain/sessionKey";

const AppContent: React.FC = () => {
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
        <div className="space-y-4 mb-20">
          <OldTradeWallet />
          <TradeWallet />
          <Tab />
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
    </div>
  );
};

function App() {
  useEffect(() => {
    const init = async () => {
      // 1️⃣ Try refund before registering this tab
      const session = SessionKeyManager.getData();
      if (session) {
        if (session.stale && session.activeTabs.length === 0) {
          try {
            console.log("Attempting refund...");
            await withdrawFundSessionKey();
            SessionKeyManager.clear();
            console.log("Refund successful");
          } catch (e) {
            console.log("Refund failed, will retry later", e);
          }
        } else {
          console.log("Session active or other tabs still active");
        }
      }

      // 2️⃣ Now register this tab
      const tabId = crypto.randomUUID();
      SessionKeyManager.addActiveTab(tabId);

      // 3️⃣ Setup unload listener
      const handleBeforeUnload = () => {
        SessionKeyManager.removeActiveTab(tabId);
      };
      window.addEventListener("beforeunload", handleBeforeUnload);

      // 4️⃣ Cleanup on unmount
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        SessionKeyManager.removeActiveTab(tabId);
      };
    };

    // call the async init
    init();
  }, []);
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
