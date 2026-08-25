import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Badge, Button, Card, EmptyState, StatusDot } from "@/components/ui";
import { CheckIcon, ChevronDownIcon, ExternalIcon } from "@/components/ui/icons";
import { ContestProvider } from "./contest/ContestContext";
import ErrorBoundary from "./ErrorBoundary";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/utils/cn";
import { DEEP_CONTESTS, type Contest } from "@/utils/contests";
import { startTransition, useState, type ComponentType } from "react";
import { AiMarkets } from "./tabs/AiMarkets";
import { L1Markets } from "./tabs/L1Markets";
import { L2Markets } from "./tabs/L2Markets";
import { OctantMarkets } from "./tabs/OctantMarkets";
import { OriginalityMarkets } from "./tabs/OriginalityMarkets";
import { ZcashMarkets } from "./tabs/ZcashMarkets";

/**
 * Which component renders each contest. The id / label / finished flag come from the shared
 * registry (`@/utils/contests`) so the leaderboard job and this tab bar cannot disagree about
 * what the contests are.
 */
const CONTEST_COMPONENTS: Record<string, ComponentType> = {
  zcash: ZcashMarkets,
  octant: OctantMarkets,
  "round2-l2": L2Markets,
  "round2-l1": L1Markets,
  round2: OriginalityMarkets,
  round1: AiMarkets,
};

const TABS = DEEP_CONTESTS.filter((contest) => !(contest as Contest).hidden).map((contest) => ({
  ...contest,
  Component: CONTEST_COMPONENTS[contest.id],
}));

const LIVE_TABS = TABS.filter((tab) => !tab.finished);
const ARCHIVED_TABS = TABS.filter((tab) => tab.finished);

const DEFAULT_TAB: string = "round2-l1";

/**
 * Four of five contests have ended, so they sit in an archive menu rather than
 * competing with the live one for the same row — the labels used to carry a
 * "(Finished)" suffix each, which read as five equal choices.
 */
export const Tab = () => {
  const [storedTab, setStoredTab] = useLocalStorage<string>("active-contest", DEFAULT_TAB);
  const initial = TABS.some((tab) => tab.id === storedTab) ? storedTab : DEFAULT_TAB;

  const [activeTab, setActiveTab] = useState<string>(initial);
  // Lazy-mount: only render a tab once it's been visited.
  // Once mounted, keep it alive (hidden) so useLocalStorage / useMemo state is preserved.
  const [visited, setVisited] = useState<Set<string>>(() => new Set([initial]));

  const handleTabClick = (tabId: string) => {
    startTransition(() => setActiveTab(tabId));
    setStoredTab(tabId);
    if (!visited.has(tabId)) {
      setVisited((prev) => new Set([...prev, tabId]));
    }
  };

  const activeArchived = ARCHIVED_TABS.find((tab) => tab.id === activeTab);
  const activeContest = TABS.find((tab) => tab.id === activeTab);
  // If the contest is a collection of markets, it will contain marketIds instead
  const activeMarketId =
    activeContest && "marketId" in activeContest ? activeContest.marketId : undefined;

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 border-b border-rule-strong">
        {LIVE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-lede font-semibold transition-colors",
                active ? "border-primary text-primary" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <StatusDot tone="long" pulse />
              {tab.label}
              <span className="text-label font-semibold tracking-wider text-long uppercase">Live</span>
            </button>
          );
        })}

        {/* Radix locks body scroll in modal mode; that shift is what flashed. */}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger
            className={cn(
              "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-4 py-3 text-lede font-semibold transition-colors",
              activeArchived
                ? "border-primary text-primary"
                : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {activeArchived ? activeArchived.label : "Archive"}
            {activeArchived && <Badge tone="neutral">Ended</Badge>}
            <ChevronDownIcon className="text-ink-4" />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-56 overflow-hidden rounded-md border border-rule bg-surface py-1 shadow-pop"
            >
              <p className="px-3 py-1.5 text-label font-semibold tracking-wider text-ink-4 uppercase">
                Ended contests
              </p>
              {ARCHIVED_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <DropdownMenu.Item
                    key={tab.id}
                    onSelect={() => handleTabClick(tab.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-body outline-none transition-colors data-[highlighted]:bg-primary-bg",
                      active ? "text-ink" : "text-ink-2",
                    )}
                  >
                    <span className="w-4 shrink-0 text-primary">{active && <CheckIcon />}</span>
                    {tab.label}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Tab content — lazy-mount on first visit, then keep alive hidden */}
      <div>
        {TABS.map(({ id, Component, finished }) =>
          visited.has(id) ? (
            <div
              key={id}
              style={{ display: id === activeTab ? "block" : "none" }}
              className="space-y-6 pt-6"
            >
              {/* One contest crashing shouldn't take the whole app with it. */}
              <ErrorBoundary
                fallback={(error) => (
                  <Card>
                    <EmptyState
                      title="This contest could not be displayed"
                      description={error.message}
                      actions={
                        <Button onClick={() => window.location.reload()}>Reload the page</Button>
                      }
                    />
                  </Card>
                )}
              >
                <ContestProvider finished={finished}>
                  <Component />
                </ContestProvider>
              </ErrorBoundary>
            </div>
          ) : null,
        )}
      </div>

      {/* Link directly to the host market id. Contests that are a collection of markets, 
          eg Zcash, intentionally has no single market destination here, and instead link in their table */}
      {activeMarketId && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg bg-surface px-6 py-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lede font-semibold text-ink">Trading one market at a time?</p>
            <p className="mt-1 text-body text-ink-3">
              Seer has the individual market view, liquidity provision and full analytics.
            </p>
          </div>
          <a
            href={`https://app.seer.pm/markets/10/${activeMarketId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-body font-semibold text-primary transition-colors hover:text-primary-hover"
          >
            Open Seer
            <ExternalIcon width={13} height={13} />
          </a>
        </div>
      )}
    </div>
  );
};
