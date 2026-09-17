import { ContestChart } from "@/components/contest/ContestChart";
import { FigureLabel } from "@/components/contest/FigureLabel";
import { RefreshVolumeButton } from "@/components/contest/RefreshVolumeButton";
import { SegmentedControl } from "@/components/ui";
import {
  chartLiquidity,
  chartVolume,
  liveSeries,
  useMarketCharts,
  type MarketChart,
} from "@/hooks/useMarketCharts";
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
  const {
    data: charts,
    isLoading: isLoadingCharts,
    error: chartsError,
  } = useMarketCharts(marketIds);
  // `useMarketCharts` keys its record by lowercased id — see `fetchMarketCharts`.
  const chart = selected ? charts?.[selected.toLowerCase()] : undefined;

  /**
   * Invalid is never seeded with liquidity, so its series is empty and it would sit in the legend as
   * a permanent dash. Dropped by token address rather than by label — `invalidIndexOf` is the one
   * place that rule lives, and matching on "Invalid result" would break the moment it is reworded.
   */
  const series = useMemo(() => {
    const drawn = liveSeries(chart);
    if (!drawn) return undefined;
    const invalidToken = market?.wrappedTokens[invalidIndexOf(market.wrappedTokens)]?.toLowerCase();
    if (!invalidToken) return drawn;
    return drawn.filter((entry) => entry.outcomeId.toLowerCase() !== invalidToken);
  }, [chart, market]);

  /**
   * Two levels of figure, told apart by where they sit rather than by a caption.
   *
   * The ballot totals sit on top, over the question tabs, and do not move when a tab is picked. The
   * selected question's own figures sit inside the tab tray, under the tabs, so they read as
   * belonging to whichever tab is active — whole ballot above, one question below. Every NU7
   * question is collateralised in sUSDS, so the five are summable as they stand.
   *
   * The stack is built here rather than through `ContestChart`'s `volume`/`liquidity` slots, which
   * lay out in a row beside the actions: side by side, the totals and the tray read as peers, and
   * the pair is wide enough to squeeze the question text into a column.
   *
   * Only the numbers are taken from the stored strings. They end in the collateral's *name*
   * ("Savings USDS"), not its symbol, so splitting a symbol out of them prints "0.20 Savings".
   */
  const volumeTotal = totalLabel("Total volume", charts, chartVolume);
  const liquidityTotal = totalLabel("Total liquidity", charts, chartLiquidity);

  const volume = chartVolume(chart);
  const liquidity = chartLiquidity(chart);

  return (
    <ContestChart
      data={series}
      isLoading={isLoading || isLoadingCharts}
      error={chartsError}
      eyebrow="Zcash · NU7"
      title="Outcome prices over time"
      // The question itself, which the table's band row states only once per group.
      description={market?.marketName}
      actions={
        segments.length > 0 && (
          <div className="flex flex-col items-end gap-2">
            {(volumeTotal || liquidityTotal) && (
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-body text-ink-3">
                {volumeTotal && (
                  <span className="inline-flex items-center gap-1.5">
                    {volumeTotal}
                    {/* Every question, not just the selected one: a refresh that moved one of them
                        would leave the total disagreeing with its own parts. */}
                    <RefreshVolumeButton marketIds={marketIds} />
                  </span>
                )}
                {volumeTotal && liquidityTotal && <span className="text-ink-4">·</span>}
                {liquidityTotal}
              </div>
            )}
            <div className="inline-flex flex-col rounded-md border border-rule bg-sunken p-0.5">
              <SegmentedControl
                bare
                size="sm"
                segments={segments}
                value={selected ?? segments[0].id}
                onChange={setSelected}
              />
              {(volume || liquidity) && (
                <div className="flex items-center justify-center gap-2 px-2 py-1 text-label text-ink-3">
                  {volume && (
                    <FigureLabel
                      label="Vol"
                      cash={volume.collateral}
                      tokens={volume.tokens}
                      symbol={collateral.symbol}
                      showSymbol={false}
                    />
                  )}
                  {volume && liquidity && <span className="text-ink-4">·</span>}
                  {liquidity && (
                    <FigureLabel
                      label="Liq"
                      cash={liquidity.collateral}
                      tokens={liquidity.tokens}
                      symbol={collateral.symbol}
                      showSymbol={false}
                    />
                  )}
                  <span>{collateral.symbol}</span>
                </div>
              )}
            </div>
          </div>
        )
      }
    />
  );
}

/**
 * A figure summed over every question on the ballot.
 *
 * The token count is summed only when every question has one: a blob written before the count was
 * stored would otherwise make the total quietly smaller than its parts.
 */
function totalLabel(
  label: string,
  charts: Record<string, MarketChart> | undefined,
  read: (chart: MarketChart | undefined) => { collateral: number; tokens?: number } | undefined,
) {
  const figures = Object.values(charts ?? {}).flatMap((entry) => read(entry) ?? []);
  if (!figures.length) return undefined;

  const cash = figures.reduce((acc, figure) => acc + figure.collateral, 0);
  const tokens = figures.every((figure) => figure.tokens !== undefined)
    ? figures.reduce((acc, figure) => acc + (figure.tokens ?? 0), 0)
    : undefined;

  return <FigureLabel label={label} cash={cash} tokens={tokens} symbol={collateral.symbol} />;
}
