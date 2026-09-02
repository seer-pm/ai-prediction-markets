import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React, { useCallback, useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAccount, WagmiProvider } from "wagmi";
import ErrorBoundary from "./components/ErrorBoundary";
import Footer from "./components/Footer";
import { LeaderboardPanel } from "./components/leaderboard/LeaderboardPanel";
import { ProfileDialog } from "./components/profile/ProfileDialog";
import { ReadinessRail } from "./components/ReadinessRail";
import { Tab } from "./components/Tab";
import { UnclaimedPayouts } from "./components/trade/UnclaimedPayouts";
import { TradeWalletMenu } from "./components/trade/TradeWalletMenu";
import { Button, Card, EmptyState, TooltipProvider } from "./components/ui";
import { BookIcon } from "./components/ui/icons";
import { WalletConnect } from "./components/WalletConnect";
import {
  localStoragePersister,
  PERSIST_BUSTER,
  queryClient,
  shouldDehydrateQuery,
} from "./config/queryClient";
import { config } from "./config/wagmi";
import { SessionKeyManager, withdrawFundSessionKey } from "./lib/on-chain/sessionKey";
import { cn } from "./utils/cn";

const CONTAINER = "mx-auto w-full max-w-[86rem] px-4 sm:px-6 lg:px-8";

/**
 * Top-level views. The leaderboard is not a contest — it spans all of them — so it is a page of
 * its own reached from the header rather than a sixth entry in the contest tab bar.
 *
 * The URL is the source of truth, so a view is linkable and survives a reload. This needs the
 * SPA redirect in `netlify.toml`; without it a direct hit on `/leaderboard` 404s.
 */
type View = "markets" | "leaderboard";

const PATHS: Record<View, string> = {
  markets: "/",
  leaderboard: "/leaderboard",
};

function viewFromPath(pathname: string): View {
  // Tolerate a trailing slash so `/leaderboard/` is not silently the markets page.
  return pathname.replace(/\/+$/, "").toLowerCase() === "/leaderboard" ? "leaderboard" : "markets";
}

const AppContent: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [profileOpen, setProfileOpen] = useState(false);

  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  /**
   * Which views have ever been shown. A view is mounted only once it has been *visible*, then
   * kept alive hidden.
   *
   * Mounting a hidden view is not harmless here: `MarketChart` measures `container.clientWidth`
   * on mount, and inside a `display: none` subtree that is 0, so every chart and table would
   * come up empty and never recover. Landing directly on `/leaderboard` used to do exactly that
   * to the whole markets page.
   */
  const [mounted, setMounted] = useState<Set<View>>(
    () => new Set([viewFromPath(window.location.pathname)]),
  );

  const show = useCallback((next: View) => {
    setView(next);
    setMounted((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  }, []);

  /**
   * Buttons, not `<a href>`s. An anchor navigates for real whenever the click is not
   * intercepted, which turns an in-app view switch into a full page load; `pushState` keeps the
   * URL linkable without ever handing the click back to the browser.
   */
  const goTo = (next: View) => {
    if (window.location.pathname !== PATHS[next]) {
      window.history.pushState(null, "", PATHS[next]);
    }
    show(next);
  };

  // Back/forward buttons.
  useEffect(() => {
    const onPopState = () => show(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [show]);

  return (
    // The app scrolls here rather than on the document — see the note in
    // index.css. `mt-auto` on the footer still pins it when content is short.
    <div className="flex h-dvh flex-col overflow-y-auto bg-paper">
      {/* Opaque, not frosted — a persistent backdrop-filter re-composites the
          page beneath it on every scroll and reflow. */}
      <header className="sticky top-0 z-30 bg-surface shadow-raised">
        <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-baseline gap-3">
            {/* The title doubles as the way home, so the markets need no nav item of their own. */}
            <h1 className="truncate text-title font-bold">
              <button
                onClick={() => goTo("markets")}
                aria-current={view === "markets" ? "page" : undefined}
                className="cursor-pointer text-ink transition-colors hover:text-primary"
              >
                AI Prediction Markets
              </button>
            </h1>
            <span className="hidden text-label font-semibold tracking-wider text-ink-4 uppercase sm:inline">
              Optimism
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Ahead of the external Guide link so internal and outbound navigation do not read
                as the same kind of thing. */}
            <button
              onClick={() => goTo("leaderboard")}
              aria-current={view === "leaderboard" ? "page" : undefined}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1.5 text-body font-semibold transition-colors",
                // Same selected-chip vocabulary as the leaderboard's market selector, so
                // "current page" reads at a glance against the primary-coloured Guide link.
                view === "leaderboard"
                  ? "bg-primary-bg text-primary"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              Leaderboard
            </button>

            {/* Only once there is an account to attach a profile to. It opens a dialog rather
                than navigating, so it never takes the `aria-current` treatment above. */}
            {isConnected && address && (
              <button
                onClick={() => setProfileOpen(true)}
                className="cursor-pointer rounded-md px-2.5 py-1.5 text-body font-semibold text-ink-3 transition-colors hover:text-ink"
              >
                Profile
              </button>
            )}

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
          {/* Settled payouts nobody has claimed. Renders nothing unless there are some, so it
              costs no space on the common path — but nothing else in the app looks across
              contests, so without it an archived contest's payout is never surfaced at all. */}
          <UnclaimedPayouts onOpenMarkets={() => goTo("markets")} />

          {/* Once shown, a view stays mounted and toggles with `display`, like the contest panels
              inside Tab: unmounting would drop each contest's lazy-mount and local state, so a
              trip to the leaderboard would silently reset an in-progress trade. */}
          {mounted.has("markets") && (
            <div style={{ display: view === "markets" ? "block" : "none" }} className="space-y-6">
              <ReadinessRail />
              {/* The Seer pointer used to live here, under every contest. It now renders inside
                  each live contest panel (Tab.tsx), since it invites trading and a finished
                  contest has none left to do. */}
              <Tab />
            </div>
          )}

          {mounted.has("leaderboard") && (
            <div style={{ display: view === "leaderboard" ? "block" : "none" }}>
              <ErrorBoundary
                fallback={(error) => (
                  <Card>
                    <EmptyState
                      title="The leaderboard could not be displayed"
                      description={error.message}
                      actions={
                        <Button onClick={() => window.location.reload()}>Reload the page</Button>
                      }
                    />
                  </Card>
                )}
              >
                <LeaderboardPanel />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {address && (
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} account={address} />
      )}
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
          buster: PERSIST_BUSTER,
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
