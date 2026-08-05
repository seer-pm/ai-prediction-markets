import { ContestChart } from "@/components/contest/ContestChart";
import { Select } from "@/components/ui";
import { ChartWithMarketData } from "@/types";
import { formatAmount } from "@/utils/format";
import { useEffect, useState } from "react";

export default function L2Charts({
  repoOptions,
  charts,
  totalVolumeMapping,
  isLoading,
}: {
  repoOptions: { id: string; text: string }[];
  charts?: { [key: string]: ChartWithMarketData };
  totalVolumeMapping?: { [key: string]: string };
  isLoading: boolean;
}) {
  const [repoSelected, setRepoSelected] = useState<string | undefined>(repoOptions[0]?.id);

  useEffect(() => {
    if (repoOptions.length && !repoSelected) {
      setRepoSelected(repoOptions[0].id);
    }
  }, [repoOptions, repoSelected]);

  const chartData = repoSelected ? charts?.[repoSelected] : undefined;
  const totalVolumeMarket = repoSelected ? totalVolumeMapping?.[repoSelected] : undefined;

  const volumeLabel = (() => {
    if (!totalVolumeMarket) return undefined;
    const [volume, symbol] = totalVolumeMarket.split(" ");
    return (
      <>
        Volume{" "}
        <span className="font-mono text-ink">
          {formatAmount(Number(volume))} {symbol}
        </span>
      </>
    );
  })();

  return (
    <ContestChart
      data={chartData}
      isLoading={isLoading}
      eyebrow="Round 2 · L2"
      title="Dependency prices over time"
      description="One repository at a time — each has its own set of dependency markets."
      volume={volumeLabel}
      actions={
        repoOptions.length > 0 && (
          <Select
            className="w-full sm:w-64"
            placeholder="Select a repository"
            searchPlaceholder="Search repositories…"
            options={repoOptions}
            selectedId={repoSelected}
            onChange={setRepoSelected}
          />
        )
      }
    />
  );
}
