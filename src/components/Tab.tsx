import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Badge, Button, Card, EmptyState, StatusDot } from "@/components/ui";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { ContestProvider } from "./contest/ContestContext";
import ErrorBoundary from "./ErrorBoundary";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLeaderboardStore } from "@/stores/leaderboardStore";
import { cn } from "@/utils/cn";
import { DEEP_CONTESTS } from "@/utils/contests";
import { startTransition, useEffect, useState, type ComponentType } from "react";
import { AiMarkets } from "./tabs/AiMarkets";
import { L1Markets } from "./tabs/L1Markets";
import { L2Markets } from "./tabs/L2Markets";
import { Leaderboard } from "./tabs/Leaderboard";
import { OctantMarkets } from "./tabs/OctantMarkets";
import { OriginalityMarkets } from "./tabs/OriginalityMarkets";

/**
 * Which component renders each contest. The id / label / finished flag come from the shared
 * registry (`@/utils/contests`) so the leaderboard job and this tab bar cannot disagree about
 * what the contests are.
 */
const CONTEST_COMPONENTS: Record<string, ComponentType> = {
  octant: OctantMarkets,
  "round2-l2": L2Markets,
  "round2-l1": L1Markets,
  round2: OriginalityMarkets,
  round1: AiMarkets,
};

const TABS = DEEP_CONTESTS.map((contest) => ({
  ...contest,
  Component: CONTEST_COMPONENTS[contest.id],
}));

const LIVE_TABS = TABS.filter((tab) => !tab.finished);
const ARCHIVED_TABS = TABS.filter((tab) => tab.finished);

const LEADERBOARD_TAB = "leaderboard";

/** Every mountable panel: the contests, plus the cross-contest leaderboard. */
const PANELS = [
  ...TABS.map(({ id, Component, finished }) => ({ id, Component, finished })),
  { id: LEADERBOARD_TAB, Component: Leaderboard, finished: true },
];

const DEFAULT_TAB: string = "round2-l1";

/**
 * Four of five contests have ended, so they sit in an archive menu rather than
 * competing with the live one for the same row — the labels used to carry a
 * "(Finished)" suffix each, which read as five equal choices.
 */
export const Tab = () => {
  const [storedTab, setStoredTab] = useLocalStorage<string>("active-contest", DEFAULT_TAB);
  const initial = PANELS.some((panel) => panel.id === storedTab) ? storedTab : DEFAULT_TAB;

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

  // "View full leaderboard" on a contest card asks for the leaderboard tab, scoped to that
  // contest. `requestId` (not `scope`) is the trigger, so asking twice for the same contest
  // still switches back.
  const leaderboardRequestId = useLeaderboardStore((state) => state.requestId);
  useEffect(() => {
    if (leaderboardRequestId === 0) return;
    handleTabClick(LEADERBOARD_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardRequestId]);

  const activeArchived = ARCHIVED_TABS.find((tab) => tab.id === activeTab);
  const leaderboardActive = activeTab === LEADERBOARD_TAB;

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

        {/* Not a contest, so it sits apart from them rather than as a sixth peer. */}
        <button
          onClick={() => handleTabClick(LEADERBOARD_TAB)}
          className={cn(
            "-mb-px ml-auto inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-lede font-semibold transition-colors",
            leaderboardActive
              ? "border-primary text-primary"
              : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          Leaderboard
        </button>
      </div>

      {/* Tab content — lazy-mount on first visit, then keep alive hidden */}
      <div>
        {PANELS.map(({ id, Component, finished }) =>
          visited.has(id) ? (
            <div
              key={id}
              style={{ display: id === activeTab ? "block" : "none" }}
              className="space-y-6 pt-6"
            >
              {/* One panel crashing shouldn't take the whole app with it. */}
              <ErrorBoundary
                fallback={(error) => (
                  <Card>
                    <EmptyState
                      title={
                        id === LEADERBOARD_TAB
                          ? "The leaderboard could not be displayed"
                          : "This contest could not be displayed"
                      }
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
    </div>
  );
};
