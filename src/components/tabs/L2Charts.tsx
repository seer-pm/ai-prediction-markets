import { ContestChart } from "@/components/contest/ContestChart";
import { VolumeLabel } from "@/components/contest/VolumeLabel";
import { Select } from "@/components/ui";
import { chartVolume, useMarketChart } from "@/hooks/useMarketCharts";

import { useEffect, useState } from "react";

/**
 * `repoOptions` carries each repository's market id, so the selection *is* the market to chart.
 *
 * This tab used to receive every repository's full price history — the single biggest payload in the
 * app, tens of megabytes — to draw the one the dropdown had selected. Now it fetches that one, and
 * switching back to a repository already seen is served from the query cache.
 */
export default function L2Charts({
  repoOptions,
  isLoading,
}: {
  repoOptions: { id: string; text: string }[];
  isLoading: boolean;
}) {
  const [repoSelected, setRepoSelected] = useState<string | undefined>(repoOptions[0]?.id);

  useEffect(() => {
    if (repoOptions.length && !repoSelected) {
      setRepoSelected(repoOptions[0].id);
    }
  }, [repoOptions, repoSelected]);

  const { data: chart, isLoading: isLoadingChart } = useMarketChart(repoSelected);

  const volumeLabel = (() => {
    const volume = chartVolume(chart);
    if (!volume) return undefined;
    // A dependency market is collateralised in its parent's outcome token, so the cash leg is
    // denominated in that token's name rather than in sUSDS.
    const [, symbol] = (chart?.totalVolumeMarket ?? "").split(" ");
    return (
      <VolumeLabel label="Volume" cash={volume.collateral} tokens={volume.tokens} symbol={symbol} />
    );
  })();

  return (
    <ContestChart
      data={chart?.series}
      isLoading={isLoading || isLoadingChart}
      eyebrow="Round 2 · L2"
      title="Dependency prices over time"
      description="One repository at a time — each has its own set of dependency markets."
      volume={volumeLabel}
      refreshMarketIds={repoSelected ? [repoSelected] : []}
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
