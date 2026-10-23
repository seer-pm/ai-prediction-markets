import { ChartLegend, type LegendEntry } from "@/components/ChartLegend";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ChartSeries } from "@/types";
import { withAlpha } from "@/utils/color";
import { formatWeight } from "@/utils/format";
import { EMPTY_PINS, defaultPins, pinSlot, togglePin, type Pins } from "@/utils/pins";
import { useTheme } from "@/stores/themeStore";
import {
  createChart,
  type DeepPartial,
  type ChartOptions,
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
import ErrorBoundary from "./ErrorBoundary";

/**
 * Series colours from the kit's tokens: four slots for the series the reader follows, the text
 * colour for the one under the cursor, and the muted colour for the rest of the field. Read on
 * every repaint, since the canvas cannot follow a CSS variable through a theme change.
 */
function seriesColors() {
  const tokens = getComputedStyle(document.documentElement);
  const token = (name: string) => tokens.getPropertyValue(name).trim();
  return {
    slots: [1, 2, 3, 4].map((slot) => token(`--seer-series-${slot}`)),
    hovered: token("--seer-text"),
    context: token("--seer-muted"),
  };
}

/**
 * The axis, grid and crosshair, read from the kit's tokens on `<html>` so the chart follows the
 * theme. The canvas cannot use CSS variables itself, so these are re-read on every theme change.
 */
function chromeOptions(): DeepPartial<ChartOptions> {
  const tokens = getComputedStyle(document.documentElement);
  const token = (name: string) => tokens.getPropertyValue(name).trim();
  const muted = token("--seer-muted");
  const border = token("--seer-border");
  return {
    layout: {
      background: { color: "transparent" },
      textColor: muted,
      fontFamily: token("--seer-font-sans"),
      fontSize: 12,
    },
    grid: {
      vertLines: { color: border, style: LineStyle.SparseDotted },
      horzLines: { color: border, style: LineStyle.SparseDotted },
    },
    crosshair: {
      vertLine: { color: muted, labelBackgroundColor: token("--seer-text") },
      horzLine: { color: muted, labelBackgroundColor: token("--seer-text") },
    },
    timeScale: { timeVisible: true, rightOffset: 12, borderColor: border },
  };
}

type Props = {
  /** Already resampled by the background job — see `ChartSeries`. Draw it, don't rebuild it. */
  data: ChartSeries[];
  totalVolumeMarket?: string | ReactElement;
  /** Current pool depth, printed beside the volume figure in the header. */
  liquidity?: string | ReactElement;
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** How a series' latest price reads in the legend. Weights by default. */
  formatValue?: (value: number) => string;
  /**
   * The series followed in colour, by outcome name. Given with `onPinsChange`, a parent can share
   * them with a table; otherwise the chart keeps its own, starting on the leaders.
   */
  pins?: Pins;
  onPinsChange?: (pins: Pins) => void;
};

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
  liquidity,
  title = "Price history",
  description,
  actions,
  formatValue = formatWeight,
  pins: controlledPins,
  onPinsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useTheme();
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const seriesTitles = useRef<string[]>([]);

  const [ownPins, setOwnPins] = useState<Pins>(() => defaultPins(data));
  const pins = controlledPins ?? ownPins;
  const setPins = onPinsChange ?? setOwnPins;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredRef = useRef<number | null>(null);

  // A new series set starts over on its own leaders, and nothing stays hovered.
  useEffect(() => {
    if (!controlledPins) setOwnPins(defaultPins(data));
    setHovered(null);
    hoveredRef.current = null;
    // `controlledPins` only decides who owns the pins; a change to it is not a new series set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const legendEntries: LegendEntry[] = useMemo(
    () =>
      data.map((series, index) => ({
        index,
        name: series.outcomeName,
        slot: pinSlot(pins, series.outcomeName),
        value: series.lastPrice,
      })),
    [data, pins],
  );

  const appliedHighlight = useRef<number | null | undefined>(undefined);
  const highlightFrame = useRef<number | null>(null);

  /**
   * Followed series in their slot colours with a label at the line end, the hovered one in the
   * text colour on top, and the rest of the field as muted context that steps further back while
   * one line is being read.
   */
  const applyHighlightNow = useCallback(
    (target: number | null) => {
      const colors = seriesColors();
      const lifted: number[] = [];

      seriesRef.current.forEach((series, index) => {
        if (!series) return;
        const slot = pinSlot(pinsRef.current, data[index]?.outcomeName ?? "");
        const isHovered = target === index;
        const followed = slot !== null;
        if (followed) lifted.push(index);

        series.applyOptions({
          visible: true,
          lineWidth: isHovered ? 3 : followed ? 2 : 1,
          color: isHovered
            ? followed
              ? colors.slots[slot]
              : colors.hovered
            : followed
              ? colors.slots[slot]
              : withAlpha(colors.context, target === null ? 0.3 : 0.14),
          title: isHovered || followed ? (seriesTitles.current[index] ?? "") : "",
          lastValueVisible: isHovered || followed,
          priceLineVisible: false,
        });
      });

      // Later series draw over earlier ones, so the lines being read go to the top of the stack.
      const total = seriesRef.current.length;
      if (target !== null && !lifted.includes(target)) lifted.push(target);
      lifted.forEach((index) => seriesRef.current[index]?.setSeriesOrder(total - 1));
    },
    [data],
  );

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

  // A change of pins or theme has to repaint even when the hovered series is the same.
  const refreshHighlight = useCallback(() => {
    appliedHighlight.current = undefined;
    applyHighlight(hoveredRef.current);
  }, [applyHighlight]);

  useEffect(() => {
    refreshHighlight();
  }, [pins, refreshHighlight]);

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
    (name: string) => setPins(togglePin(pinsRef.current, name)),
    [setPins],
  );

  const clearPins = useCallback(() => setPins(EMPTY_PINS), [setPins]);

  /* ============================
     CREATE CHART
  ============================ */
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      ...chromeOptions(),
      rightPriceScale: { borderVisible: false },
    });

    chartRef.current = chart;

    data.forEach((outcomeData) => {
      const series = chart.addSeries(LineSeries, {
        lineWidth: 1,
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

      const lineData: LineData[] = outcomeData.points.map(([time, value]) => ({
        time: time as UTCTimestamp,
        value,
      }));

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

  // `data-theme` is already on <html> when this runs, so the tokens read are the new theme's.
  useEffect(() => {
    chartRef.current?.applyOptions(chromeOptions());
    refreshHighlight();
  }, [theme, refreshHighlight]);

  return (
    <Card flush>
      <CardHeader
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-3">
            {totalVolumeMarket && <span className="text-body text-ink-3">{totalVolumeMarket}</span>}
            {liquidity && <span className="text-body text-ink-3">{liquidity}</span>}
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
              hovered={hovered}
              onToggle={toggleSeries}
              onClear={clearPins}
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
