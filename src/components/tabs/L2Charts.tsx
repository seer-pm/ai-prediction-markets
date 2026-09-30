import { ContestChart } from "@/components/contest/ContestChart";
import { FigureLabel } from "@/components/contest/FigureLabel";
import { Select } from "@/components/ui";
import { chartLiquidity, chartVolume, liveSeries, useMarketChart } from "@/hooks/useMarketCharts";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";

import { useEffect, useState } from "react";

/**
 * `repoOptions` carries each repository's market id, so the selection *is* the market to chart.
 *
 * This tab used to receive every repository's full price history — the single biggest payload in the
 * app, tens of megabytes — to draw the one the dropdown had selected. Now it fetches that one, and
 * switching back to a repository already seen is served from the query cache.
 */
/**
 * A dependency market is collateralised in its parent's outcome token, not sUSDS. The parent's
 * repositories (Invalid aside) share one sUSDS between them, so each token is valued at an even share.
 */
const UNIT_PRICE = 1 / (l2MarketOutcomes.length - 1);

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

  const {
    data: chart,
    isLoading: isLoadingChart,
    error: chartError,
  } = useMarketChart(repoSelected);

  const volumeLabel = (() => {
    const volume = chartVolume(chart);
    if (!volume) return undefined;
    return (
      <FigureLabel
        label="Volume"
        cash={volume.collateral}
        tokens={volume.tokens}
        unitPrice={UNIT_PRICE}
      />
    );
  })();

  const liquidityLabel = (() => {
    const liquidity = chartLiquidity(chart);
    if (!liquidity) return undefined;
    return <FigureLabel label="Liquidity" cash={liquidity.collateral} unitPrice={UNIT_PRICE} />;
  })();

  return (
    <ContestChart
      data={liveSeries(chart)}
      isLoading={isLoading || isLoadingChart}
      error={chartError}
      eyebrow="Round 2 · L2"
      title="Dependency prices over time"
      description="One repository at a time — each has its own set of dependency markets."
      volume={volumeLabel}
      liquidity={liquidityLabel}
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
