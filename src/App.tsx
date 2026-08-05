import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React, { useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAccount, WagmiProvider } from "wagmi";
import Footer from "./components/Footer";
import { ReadinessRail } from "./components/ReadinessRail";
import { Tab } from "./components/Tab";
import { OldTradeWallet } from "./components/trade/OldTradeWallet";
import { TradeWalletMenu } from "./components/trade/TradeWalletMenu";
import { TooltipProvider } from "./components/ui";
import { BookIcon, ExternalIcon } from "./components/ui/icons";
import { WalletConnect } from "./components/WalletConnect";
import { localStoragePersister, queryClient, shouldDehydrateQuery } from "./config/queryClient";
import { config } from "./config/wagmi";
import { SessionKeyManager, withdrawFundSessionKey } from "./lib/on-chain/sessionKey";

const CONTAINER = "mx-auto w-full max-w-[86rem] px-4 sm:px-6 lg:px-8";

const AppContent: React.FC = () => {
  const { isConnected } = useAccount();

  return (
    // The app scrolls here rather than on the document — see the note in
    // index.css. `mt-auto` on the footer still pins it when content is short.
    <div className="flex h-dvh flex-col overflow-y-auto bg-paper">
      {/* Opaque, not frosted — a persistent backdrop-filter re-composites the
          page beneath it on every scroll and reflow. */}
      <header className="sticky top-0 z-30 bg-surface shadow-raised">
        <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-title font-bold text-ink">AI Prediction Markets</h1>
            <span className="hidden text-label font-semibold tracking-wider text-ink-4 uppercase sm:inline">
              Optimism
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-body font-semibold text-primary transition-colors hover:text-primary-hover sm:inline-flex"
              href="https://deep-pm.gitbook.io/seer-docs"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookIcon />
              Guide
            </a>
            {isConnected ? <TradeWalletMenu /> : <WalletConnect />}
          </div>
        </div>
      </header>

      <main className={`${CONTAINER} flex-1 py-8`}>
        <div className="space-y-6 pb-16">
          <OldTradeWallet />
          <ReadinessRail />
          <Tab />

          <div className="flex flex-col gap-3 rounded-lg bg-surface px-6 py-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lede font-semibold text-ink">Trading one market at a time?</p>
              <p className="mt-1 text-body text-ink-3">
                Seer has the individual market view, liquidity provision and full analytics.
              </p>
            </div>
            <a
              href="https://app.seer.pm/markets/10/what-will-be-the-juror-weight-computed-through-huber-loss-minimization-in-the-lo-2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-body font-semibold text-primary transition-colors hover:text-primary-hover"
            >
              Open Seer
              <ExternalIcon width={13} height={13} />
            </a>
          </div>
        </div>
      </main>

      <Footer />
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
        persistOptions={{
          persister: localStoragePersister,
          dehydrateOptions: { shouldDehydrateQuery },
        }}
      >
        <TooltipProvider>
          <ToastContainer />
          <AppContent />
        </TooltipProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
