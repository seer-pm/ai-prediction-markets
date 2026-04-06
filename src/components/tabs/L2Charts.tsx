import { useEffect, useState } from "react";
import DropdownSelect from "../DropdownSelect";
import { ChartWithMarketData } from "@/types";
import MarketChart from "../MarketChart";

export default function L2Charts({
  repoOptions,
  charts,
}: {
  repoOptions: {
    id: string;
    text: string;
  }[];
  charts: {
    [key: string]: ChartWithMarketData;
  };
}) {
  const [repoSelected, setRepoSelected] = useState<string | undefined>(repoOptions[0].id ?? "");
  const chartData = repoSelected ? charts[repoSelected] : undefined;
  useEffect(() => {
    if (repoOptions && !repoSelected) {
      setRepoSelected(repoOptions[0].id ?? "");
    }
  }, [repoOptions]);
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-700">Select Repo:</p>
        <DropdownSelect
          placeholder="Select outcome"
          options={repoOptions}
          selectedId={repoSelected}
          onChange={setRepoSelected}
        />
      </div>
      {chartData ? <MarketChart data={chartData} /> : <p>No chart data</p>}
    </>
  );
}
