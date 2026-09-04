import { ContestChart } from "@/components/contest/ContestChart";
import { SegmentedControl } from "@/components/ui";
import { useMarketChart } from "@/hooks/useMarketCharts";
import type { ZcashNu7TableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import { invalidIndexOf } from "@/utils/zcashNu7Markets";
import { useEffect, useMemo, useState } from "react";

/**
 * One question's outcome prices over time, with a tab strip to switch between the five.
 *
 * A chart per question rather than one chart for the ballot: the outcomes of a single question
 * compete for the same 1 sUSDS and are readable together, while lines from different questions
 * share an axis without sharing a meaning. That is the same reason L2 charts one repository at a
 * time — and, as there, only the selected market's history is fetched, with `useMarketChart`
 * serving a question already looked at straight from the query cache.
 *
 * A `SegmentedControl` rather than L2's `Select`: five fixed questions fit on one row, so the whole
 * ballot stays visible instead of hiding behind a dropdown.
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
  const { data: chart, isLoading: isLoadingChart } = useMarketChart(selected);

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
    // Only the number is taken. The stored string ends in the collateral's *name* ("Savings USDS"),
    // not its symbol, so splitting a symbol out of it prints "0.20 Savings".
    const volume = (chart?.totalVolumeMarket ?? "").split(" ")[0];
    if (!volume) return undefined;
    return (
      <>
        Volume{" "}
        <span className="font-mono text-ink">
          {formatAmount(Number(volume))} {collateral.symbol}
        </span>
      </>
    );
  })();

  return (
    <ContestChart
      data={series}
      isLoading={isLoading || isLoadingChart}
      eyebrow="Zcash · NU7"
      title="Outcome prices over time"
      // The question itself, which the table's band row states only once per group.
      description={market?.marketName}
      volume={volumeLabel}
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
