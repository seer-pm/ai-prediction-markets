import { useEffect, useState } from "react";
import DropdownSelect from "../DropdownSelect";
import { ChartWithMarketData } from "@/types";
import MarketChart from "../MarketChart";

export default function L2Charts({
  repoOptions,
  charts,
  totalVolumeMapping,
}: {
  repoOptions: {
    id: string;
    text: string;
  }[];
  charts: {
    [key: string]: ChartWithMarketData;
  };
  totalVolumeMapping: {
    [key: string]: string;
  };
}) {
  const [repoSelected, setRepoSelected] = useState<string | undefined>(repoOptions[0].id ?? "");
  const chartData = repoSelected ? charts[repoSelected] : undefined;
  const totalVolumeMarket = repoSelected ? totalVolumeMapping[repoSelected] : undefined;
  const parseL2VolumeData = () => {
    if (!totalVolumeMarket) return "";
    const [volume, symbol] = totalVolumeMarket.split(" ");
    return (
      <>
        Total volume:{" "}
        <span className="font-semibold">
          {Number(volume).toFixed(2)} {symbol}
        </span>
      </>
    );
  };
  useEffect(() => {
    if (repoOptions && !repoSelected) {
      setRepoSelected(repoOptions[0].id ?? "");
    }
  }, [repoOptions]);
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm text-gray-700">Select Repo:</p>
        <DropdownSelect
          placeholder="Select outcome"
          options={repoOptions}
          selectedId={repoSelected}
          onChange={setRepoSelected}
        />
      </div>
      {chartData ? (
        <MarketChart data={chartData} totalVolumeMarket={parseL2VolumeData()} />
      ) : (
        <p>No chart data</p>
      )}
    </>
  );
}
