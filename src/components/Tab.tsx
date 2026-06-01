import { startTransition, useState } from "react";
import { AiMarkets } from "./tabs/AiMarkets";
import { OriginalityMarkets } from "./tabs/OriginalityMarkets";
import { L1Markets } from "./tabs/L1Markets";
import { L2Markets } from "./tabs/L2Markets";

const TABS = [
  { id: "round2-l2", label: "Round 2 L2", Component: L2Markets },
  { id: "round2-l1", label: "Round 2 L1", Component: L1Markets },
  { id: "round2", label: "Round 2 Originality", Component: OriginalityMarkets },
  { id: "round1", label: "Round 1", Component: AiMarkets },
] as const;

export const Tab = () => {
  const [activeTab, setActiveTab] = useState("round2-l2");
  // Lazy-mount: only render a tab once it's been visited.
  // Once mounted, keep it alive (hidden) so useLocalStorage / useMemo state is preserved.
  const [visited, setVisited] = useState<Set<string>>(new Set(["round2-l2"]));

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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`cursor-pointer flex-1 py-2 text-center font-medium whitespace-nowrap
              ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content — lazy-mount on first visit, then keep alive hidden */}
      <div>
        {TABS.map(({ id, Component }) =>
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
