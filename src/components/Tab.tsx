import { useState } from "react";
import { AiMarkets } from "./tabs/AiMarkets";
import { OriginalityMarkets } from "./tabs/OriginalityMarkets";
import { L1Markets } from "./tabs/L1Markets";
// import { L2Markets } from "./tabs/L2Markets";

export const Tab = () => {
  const [activeTab, setActiveTab] = useState("round2-l1");

  const tabs = [
    // { id: "round2-l2", label: "Round 2 L2", component: <L2Markets /> },
    { id: "round2-l1", label: "Round 2 L1", component: <L1Markets /> },
    { id: "round2", label: "Round 2 Originality", component: <OriginalityMarkets /> },
    { id: "round1", label: "Round 1", component: <AiMarkets /> },
  ];

  return (
    <div className="w-full">
      {/* Tabs Header */}
      <div className="w-[300px] flex gap-10 border-b border-gray-300">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

      {/* Tab Content */}
      <div className="p-4 space-y-4">{tabs.find((tab) => tab.id === activeTab)?.component}</div>
    </div>
  );
};
