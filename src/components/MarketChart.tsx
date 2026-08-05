import { ChartLegend, type LegendEntry } from "@/components/ChartLegend";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ChartWithMarketData, PoolHourData } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { withAlpha } from "@/utils/color";
import { formatWeight } from "@/utils/format";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import React, {
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Address, formatUnits } from "viem";
import ErrorBoundary from "./ErrorBoundary";

const INTERVAL = 30 * 60;

/**
 * Series colours: saturated enough to tell apart at 1px on white, held to a
 * common lightness so no single line dominates. Replaces the old 60-entry list
 * that mixed neon and pastel at random and was unreadable past a dozen series.
 */
const SERIES_COLORS = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#9333EA",
  "#EA580C",
  "#0891B2",
  "#CA8A04",
  "#DB2777",
  "#4F46E5",
  "#059669",
  "#B45309",
  "#7C3AED",
  "#0E7490",
  "#BE123C",
];

const AXIS_COLOR = "#6B7280";
const GRID_COLOR = "#E5E7EB";

type Props = {
  data: ChartWithMarketData;
  totalVolumeMarket?: string | ReactElement;
  title?: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  /** How a series' latest price reads in the legend. Weights by default. */
  formatValue?: (value: number) => string;
};

function findClosestLessThanOrEqualToTimestamp(
  sortedTimestamps: number[],
  targetTimestamp: number,
) {
  let left = 0;
  let right = sortedTimestamps.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;

    if (sortedTimestamps[mid] <= targetTimestamp) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

function calculateTokenPricesFromSqrtPrice(sqrtPrice: string) {
  const s = BigInt(sqrtPrice);

  const token0Price = (2n ** 192n * 10n ** 18n) / (s * s);
  const token1Price = (s * s * 10n ** 18n) / 2n ** 192n;

  return { token0Price, token1Price };
}

function resolveOutcomePrice(d: PoolHourData, collateral: Address): number | null {
  let token0Price = d.token0Price;
  let token1Price = d.token1Price;

  if (token0Price === "0" && token1Price === "0" && d.sqrtPrice && d.sqrtPrice !== "0") {
    const prices = calculateTokenPricesFromSqrtPrice(d.sqrtPrice);

    token0Price = formatUnits(prices.token0Price, 18);
    token1Price = formatUnits(prices.token1Price, 18);
  }

  const token0IsCollateral = isTwoStringsEqual(d.pool.token0.id, collateral);

  const price = token0IsCollateral ? Number(token0Price) : Number(token1Price);

  if (!isFinite(price) || price <= 0) return null;
  return price;
}

// The window during which a series was actually tradable: from the first hour
// liquidity was present to the last hour it was still present. Falls back to
// the series' full range if no point reports liquidity > 0.
function getLiquidityWindow(series: ChartWithMarketData[number]) {
  const arr = series.poolHourDatas;
  if (!arr.length) return null;

  let start: number | null = null;
  let end: number | null = null;

  arr.forEach((d) => {
    if (Number(d.liquidity) > 0) {
      if (start === null) start = d.periodStartUnix;
      end = d.periodStartUnix;
    }
  });

  if (start === null || end === null) {
    start = arr[0].periodStartUnix;
    end = arr[arr.length - 1].periodStartUnix;
  }

  return { start, end };
}

function buildTimeline(all: ChartWithMarketData) {
  let min = Infinity;
  let max = -Infinity;

  all.forEach((o) => {
    const window = getLiquidityWindow(o);
    if (!window) return;

    min = Math.min(min, window.start);
    max = Math.max(max, window.end);
  });

  const start = Math.floor(min / INTERVAL) * INTERVAL;
  const end = Math.ceil(max / INTERVAL) * INTERVAL;

  const timeline: number[] = [];
  for (let t = start; t <= end; t += INTERVAL) {
    timeline.push(t);
  }

  return timeline;
}

/**
 * The most recent resolvable price for a series, walking back from the end of
 * its liquidity window. Drives both the legend readout and its sort order.
 */
function getLastPrice(series: ChartWithMarketData[number]): number | null {
  const window = getLiquidityWindow(series);
  const end = window?.end ?? Infinity;

  for (let i = series.poolHourDatas.length - 1; i >= 0; i--) {
    const point = series.poolHourDatas[i];
    if (point.periodStartUnix > end) continue;
    const price = resolveOutcomePrice(point, series.collateral);
    if (price != null) return price;
  }
  return null;
}

function truncateOutcomeName(name: string, maxLength = 14) {
  if (!name) return "";

  if (name.length <= maxLength) return name;

  return name.slice(0, maxLength - 2) + "…";
}

/* ================================
   COMPONENT
================================ */
const MarketChart = React.memo(function MarketChart({
  data,
  totalVolumeMarket,
  title = "Price history",
  eyebrow,
  description,
  actions,
  formatValue = formatWeight,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const seriesTitles = useRef<string[]>([]);

  // Series drawn on the chart, by index into `data`.
  const [visible, setVisible] = useState<Set<number>>(
    () => new Set(data.map((_, index) => index)),
  );
  const [hovered, setHovered] = useState<number | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const hoveredRef = useRef<number | null>(null);

  // Keep the legend in step when the underlying series set changes.
  useEffect(() => {
    setVisible(new Set(data.map((_, index) => index)));
    setHovered(null);
    hoveredRef.current = null;
  }, [data]);

  const legendEntries: LegendEntry[] = useMemo(
    () =>
      data.map((series, index) => ({
        index,
        name: series.outcomeName,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        value: getLastPrice(series),
      })),
    [data],
  );

  const appliedHighlight = useRef<number | null | undefined>(undefined);
  const highlightFrame = useRef<number | null>(null);

  /**
   * Pulls one series forward and pushes the rest back. With forty overlapping
   * lines, picking one out of the tangle is otherwise guesswork.
   */
  const applyHighlightNow = useCallback((target: number | null) => {
    seriesRef.current.forEach((series, index) => {
      if (!series) return;
      const isVisible = visibleRef.current.has(index);
      if (!isVisible) {
        series.applyOptions({ visible: false, lastValueVisible: false, title: "" });
        return;
      }

      const baseColor = SERIES_COLORS[index % SERIES_COLORS.length];
      const isHovered = target === index;
      const resting = target === null;

      series.applyOptions({
        visible: true,
        lineWidth: resting ? 2 : isHovered ? 3 : 1,
        color: resting || isHovered ? baseColor : withAlpha(baseColor, 0.18),
        title: isHovered ? (seriesTitles.current[index] ?? "") : "",
        lastValueVisible: isHovered,
        priceLineVisible: false,
      });
    });
  }, []);

  /**
   * Dragging the cursor down a hundred-row legend fires an enter event per row,
   * and each one would otherwise re-apply options to every series — thousands
   * of redraws for a gesture the eye reads as one. Collapse to one update per
   * frame, and skip it entirely when nothing actually changed.
   */
  const applyHighlight = useCallback(
    (target: number | null) => {
      if (highlightFrame.current !== null) {
        cancelAnimationFrame(highlightFrame.current);
      }
      highlightFrame.current = requestAnimationFrame(() => {
        highlightFrame.current = null;
        if (appliedHighlight.current === target) return;
        appliedHighlight.current = target;
        applyHighlightNow(target);
      });
    },
    [applyHighlightNow],
  );

  // Visibility changes have to repaint even when the hovered series is the same.
  const refreshHighlight = useCallback(() => {
    appliedHighlight.current = undefined;
    applyHighlight(hoveredRef.current);
  }, [applyHighlight]);

  useEffect(
    () => () => {
      if (highlightFrame.current !== null) cancelAnimationFrame(highlightFrame.current);
    },
    [],
  );

  const handleHover = useCallback(
    (index: number | null) => {
      hoveredRef.current = index;
      setHovered(index);
      applyHighlight(index);
    },
    [applyHighlight],
  );

  const toggleSeries = useCallback(
    (index: number) => {
      // Built outside the state updater: `applyHighlight` reads the ref
      // synchronously, and React may run an updater more than once.
      const next = new Set(visibleRef.current);
      if (next.has(index)) next.delete(index);
      else next.add(index);

      visibleRef.current = next;
      setVisible(next);
      refreshHighlight();
    },
    [refreshHighlight],
  );

  const toggleAll = useCallback(
    (nextVisible: boolean) => {
      const next = nextVisible ? new Set(data.map((_, index) => index)) : new Set<number>();
      setVisible(next);
      visibleRef.current = next;
      refreshHighlight();
    },
    [data, refreshHighlight],
  );

  /* ============================
     CREATE CHART
  ============================ */
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: AXIS_COLOR,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: GRID_COLOR, style: LineStyle.SparseDotted },
        horzLines: { color: GRID_COLOR, style: LineStyle.SparseDotted },
      },
      crosshair: {
        vertLine: { color: "#9CA3AF", labelBackgroundColor: "#111827" },
        horzLine: { color: "#9CA3AF", labelBackgroundColor: "#111827" },
      },
      timeScale: { timeVisible: true, rightOffset: 12, borderColor: GRID_COLOR },
      rightPriceScale: { borderVisible: false },
    });

    chartRef.current = chart;

    const timeline = buildTimeline(data);

    data.forEach((outcomeData, i) => {
      const window = getLiquidityWindow(outcomeData);
      const seriesEnd = window?.end ?? Infinity;
      const series = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        // Nothing on the price scale at rest: the legend is the readout, and a
        // hundred stacked labels made the right edge unreadable. The name comes
        // back only for the series being hovered.
        title: "",
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat: {
          type: "price",
          precision: 4,
          minMove: 0.0001, // should match precision
        },
      });

      seriesRef.current.push(series);
      seriesTitles.current.push(truncateOutcomeName(outcomeData.outcomeName));

      const timestamps = outcomeData.poolHourDatas.map((d) => d.periodStartUnix);

      const lineData: LineData[] = [];

      let lastPrice: number | null = null;
      // A flat stretch only needs its two endpoints — the renderer draws a
      // straight line between them. Carrying a point per 30-minute tick for
      // every one of a hundred series is what made panning crawl.
      let pendingFlat: LineData | null = null;

      timeline.forEach((t) => {
        if (t > seriesEnd) return; // stop past this series' liquidity removal

        const idx = findClosestLessThanOrEqualToTimestamp(timestamps, t);

        if (idx !== -1) {
          const price = resolveOutcomePrice(outcomeData.poolHourDatas[idx], outcomeData.collateral);

          if (price != null) {
            lastPrice = price; //update latest known price
          }
        }

        if (lastPrice == null) return;

        const previous = lineData[lineData.length - 1];
        if (previous && previous.value === lastPrice) {
          // Same value as the point before: hold it back, and only commit it
          // when the run ends so the flat segment keeps its true length.
          pendingFlat = { time: t as UTCTimestamp, value: lastPrice };
          return;
        }

        if (pendingFlat) {
          lineData.push(pendingFlat);
          pendingFlat = null;
        }
        lineData.push({ time: t as UTCTimestamp, value: lastPrice });
      });

      if (pendingFlat) lineData.push(pendingFlat);

      series.setData(lineData);
    });

    chart.timeScale().fitContent();
    // Restore whatever the legend had selected before this rebuild.
    appliedHighlight.current = undefined;
    applyHighlightNow(hoveredRef.current);

    /*
     * Deliberately not `autoSize`. Tabs are kept alive behind `display: none`,
     * which collapses this container to 0x0 — autoSize would resize a
     * hundred-series chart down to nothing on every tab switch and lay it all
     * out again on the way back. Ignoring zero-size measurements leaves a
     * hidden chart untouched, and one resize per frame covers real ones.
     */
    let resizeFrame: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        chart.applyOptions({ width: Math.floor(box.width), height: Math.floor(box.height) });
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      chart.remove();
      seriesRef.current = [];
      seriesTitles.current = [];
    };
  }, [data, applyHighlightNow]);

  return (
    <Card flush>
      <CardHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-3">
            {totalVolumeMarket && <span className="text-body text-ink-3">{totalVolumeMarket}</span>}
            {actions}
          </div>
        }
      />

      <ErrorBoundary
        fallback={(error) => (
          <EmptyState title="The chart could not be drawn" description={error.message} />
        )}
      >
        {/* Chart and legend sit side by side above md; the legend drops
            underneath as a short scrollable band on narrow screens. */}
        <div className="flex flex-col gap-4 p-6 md:h-[440px] md:flex-row">
          <div className="h-[300px] min-w-0 md:h-full md:flex-1">
            <div ref={containerRef} className="size-full" />
          </div>

          <div className="h-64 shrink-0 md:h-full md:w-60">
            <ChartLegend
              entries={legendEntries}
              visible={visible}
              hovered={hovered}
              onToggle={toggleSeries}
              onToggleAll={toggleAll}
              onHover={handleHover}
              formatValue={formatValue}
            />
          </div>
        </div>
      </ErrorBoundary>
    </Card>
  );
});

export default MarketChart;
