import { ChartWithMarketData, PoolHourData } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { ReactElement, useEffect, useRef, useState } from "react";
import { Address, formatUnits } from "viem";
import ErrorBoundary from "./ErrorBoundary";

const INTERVAL = 30 * 60;

const COLORS = [
  "#f58231",
  "#4363d8",
  "#3cb44b",
  "#e6194B",
  "#42d4f4",
  "#fabed4",
  "#469990",
  "#dcbeff",
  "#9A6324",
  "#ffe119",
  "#FF6F61",
  "#6B7280",
  "#FBBF24",
  "#34D399",
  "#3B82F6",
  "#EC4899",
  "#F97316",
  "#22D3EE",
  "#84CC16",
  "#A855F7",
  "#EF4444",
  "#10B981",
  "#6366F1",
  "#F59E0B",
  "#06B6D4",
  "#8B5CF6",
  "#D97706",
  "#14B8A6",
  "#7C3AED",
  "#F87171",
  "#4ADE80",
  "#2563EB",
  "#FBBF24",
  "#0EA5E9",
  "#A78BFA",
  "#EF6C00",
  "#2DD4BF",
  "#7E22CE",
  "#DC2626",
  "#22C55E",
  "#1D4ED8",
  "#EAB308",
  "#0891B2",
  "#9333EA",
  "#C2410C",
  "#14B8A6",
  "#6D28D9",
  "#B91C1C",
  "#16A34A",
  "#1E40AF",
  "#D97706",
  "#0E7490",
  "#7C3AED",
  "#991B1B",
  "#15803D",
  "#1E3A8A",
  "#B45309",
  "#0E7490",
  "#6B21A8",
  "#7F1D1D",
  "#047857",
];

type Props = {
  data: ChartWithMarketData;
  totalVolumeMarket?: string | ReactElement;
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

function buildTimeline(all: ChartWithMarketData) {
  let min = Infinity;
  let max = -Infinity;

  all.forEach((o) => {
    const arr = o.poolHourDatas;
    if (!arr.length) return;

    min = Math.min(min, arr[0].periodStartUnix);
    max = Math.max(max, arr[arr.length - 1].periodStartUnix);
  });

  const now = Math.floor(Date.now() / 1000); // 👈 current time

  const start = Math.floor(min / INTERVAL) * INTERVAL;
  const end = Math.ceil(Math.max(max, now) / INTERVAL) * INTERVAL; // 👈 extend to now

  const timeline: number[] = [];
  for (let t = start; t <= end; t += INTERVAL) {
    timeline.push(t);
  }

  return timeline;
}
function truncateOutcomeName(name: string, maxLength = 14) {
  if (!name) return "";

  if (name.length <= maxLength) return name;

  return name.slice(0, maxLength - 2) + "…";
}
/* ================================
   COMPONENT
================================ */
export default function MarketChart({ data, totalVolumeMarket }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  // visibility state ONLY for legend UI
  const [visible, setVisible] = useState<boolean[]>(() => data.map(() => true));
  const hasVisibleSeries = visible.some(Boolean);
  const accentColor = "#999";
  const gridLinesColor = "#e5e5e5";
  /* ============================
     CREATE CHART
  ============================ */
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 420,
      layout: {
        background: {
          color: "transparent",
        },
        textColor: accentColor,
      },
      grid: {
        vertLines: {
          color: gridLinesColor,
          style: LineStyle.SparseDotted,
        },
        horzLines: {
          color: gridLinesColor,
          style: LineStyle.SparseDotted,
        },
      },
      timeScale: { timeVisible: true, rightOffset: 250 },
      rightPriceScale: { borderVisible: false },
    });

    chartRef.current = chart;

    const timeline = buildTimeline(data);

    data.forEach((outcomeData, i) => {
      const series = chart.addSeries(LineSeries, {
        color: COLORS[i % COLORS.length],
        lineWidth: 2,
        title: truncateOutcomeName(outcomeData.outcomeName),
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: "price",
          precision: 4,
          minMove: 0.0001, // should match precision
        },
      });

      seriesRef.current.push(series);

      const timestamps = outcomeData.poolHourDatas.map((d) => d.periodStartUnix);

      const lineData: LineData[] = [];

      let lastPrice: number | null = null;

      timeline.forEach((t) => {
        const idx = findClosestLessThanOrEqualToTimestamp(timestamps, t);

        if (idx !== -1) {
          const price = resolveOutcomePrice(outcomeData.poolHourDatas[idx], outcomeData.collateral);

          if (price != null) {
            lastPrice = price; //update latest known price
          }
        }

        if (lastPrice != null) {
          lineData.push({
            time: t as any,
            value: lastPrice, //reuse last price → flat line
          });
        }
      });

      series.setData(lineData);
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      seriesRef.current = [];
    };
  }, [data]);

  /* ============================
     TOGGLE VISIBILITY
  ============================ */
  function toggleSeries(index: number) {
    const series = seriesRef.current[index];
    if (!series) return;

    const next = [...visible];
    next[index] = !next[index];
    setVisible(next);

    series.applyOptions({
      visible: next[index],
      lastValueVisible: next[index],
    });
  }

  return (
    <ErrorBoundary fallback={(error) => <p>Render chart error: {error.message}</p>}>
      {totalVolumeMarket && <p className="text-sm text-gray-700 mb-4">{totalVolumeMarket}</p>}

      <div style={{ width: "100%" }}>
        {/* Legend */}
        <div
          style={{
            overflowX: "auto",
            whiteSpace: "nowrap",
            borderBottom: "1px solid #1e293b",
            paddingBottom: 6,
            marginBottom: 8,
          }}
        >
          <button
            onClick={() => {
              const next = visible.map(() => !hasVisibleSeries);

              setVisible(next);

              seriesRef.current.forEach((series, index) => {
                series.applyOptions({
                  visible: next[index],
                  lastValueVisible: next[index],
                });
              });
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginRight: 16,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #334155",
              background: "transparent",
              color: "#999",
              cursor: "pointer",
              fontSize: 12,
              userSelect: "none",
            }}
          >
            {hasVisibleSeries ? "Clear all" : "Show all"}
          </button>
          {data.map((outcomeData, i) => {
            const isVisible = visible[i];

            return (
              <span
                key={i}
                onClick={() => toggleSeries(i)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginRight: 16,
                  opacity: isVisible ? 1 : 0.35,
                  fontSize: 13,
                  color: COLORS[i % COLORS.length],
                  userSelect: "none",
                  transition: "opacity 0.15s",
                }}
              >
                {outcomeData.outcomeName}
              </span>
            );
          })}
        </div>

        {/* Chart */}
        <div ref={containerRef} />
      </div>
    </ErrorBoundary>
  );
}
