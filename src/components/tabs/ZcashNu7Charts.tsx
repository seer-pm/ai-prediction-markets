import { ContestChart } from "@/components/contest/ContestChart";
import { FigureLabel } from "@/components/contest/FigureLabel";
import { SegmentedControl } from "@/components/ui";
import { chartLiquidity, chartVolume, useMarketCharts } from "@/hooks/useMarketCharts";
import type { ZcashNu7TableData } from "@/types";
import { collateral } from "@/utils/constants";

import { invalidIndexOf } from "@/utils/zcashNu7Markets";
import { useEffect, useMemo, useState } from "react";

/**
 * One question's outcome prices over time, with a tab strip to switch between the five.
 *
 * A chart per question rather than one chart for the ballot: the outcomes of a single question
 * compete for the same 1 sUSDS and are readable together, while lines from different questions
 * share an axis without sharing a meaning. That is the same reason L2 charts one repository at a
 * time.
 *
 * Unlike L2, though, all five questions are fetched at once. The ballot is five markets, not L2's
 * tens of megabytes of repositories, and the header prints a total across them — which cannot be
 * summed from the one question that happens to be selected. Switching questions is then free, and
 * `useMarketCharts` seeds the per-market cache entries on the way past.
 */
export default function ZcashNu7Charts({
  markets,
  isLoading,
}: {
  markets: ZcashNu7TableData[];
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<string | undefined>(markets[0]?.marketId);

  useEffect(() => {
    if (markets.length && !selected) {
      setSelected(markets[0].marketId);
    }
  }, [markets, selected]);

  const segments = useMemo(
    () => markets.map((market) => ({ id: market.marketId, label: market.shortName })),
    [markets],
  );

  const market = markets.find((entry) => entry.marketId === selected);

  const marketIds = useMemo(() => markets.map((entry) => entry.marketId), [markets]);
  const { data: charts, isLoading: isLoadingCharts } = useMarketCharts(marketIds);
  // `useMarketCharts` keys its record by lowercased id — see `fetchMarketCharts`.
  const chart = selected ? charts?.[selected.toLowerCase()] : undefined;

  /**
   * Invalid is never seeded with liquidity, so its series is empty and it would sit in the legend as
   * a permanent dash. Dropped by token address rather than by label — `invalidIndexOf` is the one
   * place that rule lives, and matching on "Invalid result" would break the moment it is reworded.
   */
  const series = useMemo(() => {
    if (!chart?.series) return undefined;
    const invalidToken = market?.wrappedTokens[invalidIndexOf(market.wrappedTokens)]?.toLowerCase();
    if (!invalidToken) return chart.series;
    return chart.series.filter((entry) => entry.outcomeId.toLowerCase() !== invalidToken);
  }, [chart?.series, market]);

  const volumeLabel = (() => {
    // Only the numbers are taken. The stored string ends in the collateral's *name* ("Savings
    // USDS"), not its symbol, so splitting a symbol out of it prints "0.20 Savings".
    const volume = chartVolume(chart);
    if (!volume) return undefined;

    /**
     * The ballot total, printed against the selected question's own figure as `question/total`.
     *
     * Every NU7 question is collateralised in sUSDS, so the five are summable as they stand. The
     * pair rides in the one figure rather than taking a slot of its own beside Liquidity: the header
     * already carries a five-segment control, and the two numbers mean more against each other —
     * this question's share, of the whole ballot — than they would sitting apart.
     */
    const all = Object.values(charts ?? {}).flatMap((entry) => chartVolume(entry) ?? []);
    const total = all.length > 1 ? all.reduce((acc, curr) => acc + curr.collateral, 0) : undefined;

    return (
      <FigureLabel
        label="Volume"
        cash={volume.collateral}
        tokens={volume.tokens}
        symbol={collateral.symbol}
        total={total}
        // Without this the second number is an unexplained figure after a slash.
        note={total !== undefined && `This question, of all ${all.length} questions.`}
      />
    );
  })();

  const liquidityLabel = (() => {
    const liquidity = chartLiquidity(chart);
    if (!liquidity) return undefined;
    return (
      <FigureLabel
        label="Liquidity"
        cash={liquidity.collateral}
        tokens={liquidity.tokens}
        symbol={collateral.symbol}
      />
    );
  })();

  return (
    <ContestChart
      data={series}
      isLoading={isLoading || isLoadingCharts}
      eyebrow="Zcash · NU7"
      title="Outcome prices over time"
      // The question itself, which the table's band row states only once per group.
      description={market?.marketName}
      volume={volumeLabel}
      liquidity={liquidityLabel}
      // Every question, not just the selected one: the header prints a total over all five, and a
      // refresh that moved one of them would leave that total disagreeing with its own parts.
      refreshMarketIds={marketIds}
      actions={
        segments.length > 0 && (
          <SegmentedControl
            size="sm"
            segments={segments}
            value={selected ?? segments[0].id}
            onChange={setSelected}
          />
        )
      }
    />
  );
}
