import type { ChartSeries } from "@/types";
import { ORIGINALITY_R3_MARKET_IDS } from "@/utils/originalityR3Markets";
import { ORIGINALITY_R3_V3_MARKET_IDS } from "@/utils/originalityR3V3Markets";
import { describe, expect, it } from "vitest";
import { ORIGINALITY_R3_V3_CHART_START, getChartStart, trimSeriesToStart } from "./chartStart";

const series = (points: [number, number][]): ChartSeries => ({
  marketId: "0x0000000000000000000000000000000000000001",
  outcomeName: "UP",
  outcomeId: "0x0000000000000000000000000000000000000002",
  points,
  lastPrice: points.length ? points[points.length - 1][1] : null,
});

describe("trimSeriesToStart", () => {
  it("leaves a series alone when there is no cut", () => {
    const input = series([[100, 0.5], [200, 0.6]]);
    expect(trimSeriesToStart(input, undefined)).toBe(input);
  });

  it("drops the points before the cut and starts the line at it, at the price then in effect", () => {
    // Seeded at 0.5, re-seeded to 0.8 before the cut, traded to 0.82 after it.
    const input = series([[100, 0.5], [200, 0.5], [300, 0.8], [500, 0.82]]);
    expect(trimSeriesToStart(input, 400).points).toEqual([[400, 0.8], [500, 0.82]]);
  });

  it("does not duplicate a point that sits exactly on the cut", () => {
    const input = series([[100, 0.5], [400, 0.8], [500, 0.82]]);
    expect(trimSeriesToStart(input, 400).points).toEqual([[400, 0.8], [500, 0.82]]);
  });

  it("keeps a single point at the cut when nothing has moved since", () => {
    const input = series([[100, 0.5], [300, 0.8]]);
    expect(trimSeriesToStart(input, 400).points).toEqual([[400, 0.8]]);
  });

  it("returns the points unchanged when they all come after the cut", () => {
    const input = series([[500, 0.8], [600, 0.82]]);
    expect(trimSeriesToStart(input, 400).points).toEqual([[500, 0.8], [600, 0.82]]);
  });

  it("leaves an empty series empty", () => {
    expect(trimSeriesToStart(series([]), 400).points).toEqual([]);
  });

  it("never shows a price from before the cut as a later one", () => {
    const input = series([[100, 0.5], [200, 0.55], [300, 0.8], [500, 0.82]]);
    const { points } = trimSeriesToStart(input, 400);
    expect(points.every(([time]) => time >= 400)).toBe(true);
    expect(points.map(([, price]) => price)).not.toContain(0.5);
    expect(points.map(([, price]) => price)).not.toContain(0.55);
  });

  it("keeps the legend's last price and does not mutate its input", () => {
    const input = series([[100, 0.5], [300, 0.8], [500, 0.82]]);
    const before = JSON.stringify(input);
    expect(trimSeriesToStart(input, 400).lastPrice).toBe(0.82);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("getChartStart", () => {
  it("covers every corrected Round 3 market, in any casing, and nothing else", () => {
    for (const id of ORIGINALITY_R3_V3_MARKET_IDS) {
      expect(getChartStart(id)).toBe(ORIGINALITY_R3_V3_CHART_START);
      expect(getChartStart(id.toUpperCase().replace("0X", "0x"))).toBe(ORIGINALITY_R3_V3_CHART_START);
    }
    for (const id of ORIGINALITY_R3_MARKET_IDS) {
      expect(getChartStart(id)).toBeUndefined();
    }
    expect(getChartStart("0x0000000000000000000000000000000000000001")).toBeUndefined();
  });

  it("is on the 30-minute grid the series are drawn on, when set", () => {
    if (ORIGINALITY_R3_V3_CHART_START === undefined) return;
    expect(ORIGINALITY_R3_V3_CHART_START % (30 * 60)).toBe(0);
    // Seconds, not milliseconds, and not before the corrected set existed (2026-10-01).
    expect(ORIGINALITY_R3_V3_CHART_START).toBeGreaterThan(1790812800);
    expect(ORIGINALITY_R3_V3_CHART_START).toBeLessThan(2000000000);
  });
});
