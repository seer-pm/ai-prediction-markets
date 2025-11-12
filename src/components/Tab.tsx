import { useState } from "react";
import { Round1 } from "./tabs/Round1";
import { Round2 } from "./tabs/Round2";

export const Tab = () => {
  const [activeTab, setActiveTab] = useState("round1");

  const tabs = [
    { id: "round1", label: "Round 1", component: <Round1 /> },
    { id: "round2", label: "Round 2", component: <Round2 /> },
  ];

  return (
    <div className="w-full">
      {/* Tabs Header */}
      <div className="w-[300px] flex border-b border-gray-300">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-pointer flex-1 py-2 text-center font-medium
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
