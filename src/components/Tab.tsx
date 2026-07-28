import { startTransition, useState } from "react";
import { AiMarkets } from "./tabs/AiMarkets";
import { OriginalityMarkets } from "./tabs/OriginalityMarkets";
import { L1Markets } from "./tabs/L1Markets";
import { L2Markets } from "./tabs/L2Markets";
import { OctantMarkets } from "./tabs/OctantMarkets";

const TABS = [
  { id: "octant", label: "Octant (Finished)", Component: OctantMarkets, finished: true },
  { id: "round2-l2", label: "Round 2 L2 (Finished)", Component: L2Markets, finished: true },
  { id: "round2-l1", label: "Round 2 L1", Component: L1Markets, finished: false },
  {
    id: "round2",
    label: "Round 2 Originality (Finished)",
    Component: OriginalityMarkets,
    finished: true,
  },
  { id: "round1", label: "Round 1 (Finished)", Component: AiMarkets, finished: true },
] as const;

// Unfinished contests first; sort is stable, so authoring order is kept within each group.
const ORDERED_TABS = [...TABS].sort((a, b) => Number(a.finished) - Number(b.finished));

const DEFAULT_TAB: string = "round2-l1";

// Color means live: blue accents the active live contest, finished ones hold a
// single gray in both states (the underline carries selection). Green dot = live.
const getTabClassName = (isActive: boolean, finished: boolean) => {
  if (finished) {
    return `text-gray-400 hover:text-gray-600 ${isActive ? "border-b-2 border-gray-400" : ""}`;
  }
  return isActive
    ? "border-b-2 border-blue-500 text-blue-600"
    : "text-gray-700 hover:text-gray-900";
};

export const Tab = () => {
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);
  // Lazy-mount: only render a tab once it's been visited.
  // Once mounted, keep it alive (hidden) so useLocalStorage / useMemo state is preserved.
  const [visited, setVisited] = useState<Set<string>>(() => new Set([DEFAULT_TAB]));

  const handleTabClick = (tabId: string) => {
    startTransition(() => setActiveTab(tabId));
    if (!visited.has(tabId)) {
      setVisited((prev) => new Set([...prev, tabId]));
    }
  };

  return (
    <div className="w-full">
      {/* Tabs Header */}
      <div className="w-fit flex gap-10 border-b border-gray-300">
        {ORDERED_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            title={tab.finished ? "Contest ended" : "Contest in progress"}
            className={`cursor-pointer flex-1 py-2 text-center font-medium whitespace-nowrap
              ${getTabClassName(activeTab === tab.id, tab.finished)}`}
          >
            <span className="inline-flex items-center gap-2">
              {!tab.finished && (
                <span
                  className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
                  aria-hidden="true"
                />
              )}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content — lazy-mount on first visit, then keep alive hidden */}
      <div>
        {ORDERED_TABS.map(({ id, Component }) =>
          visited.has(id) ? (
            <div
              key={id}
              style={{ display: id === activeTab ? "block" : "none" }}
              className="p-4 space-y-4"
            >
              <Component />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
};
