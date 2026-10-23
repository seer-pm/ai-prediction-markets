import { describe, expect, it } from "vitest";
import { EMPTY_PINS, defaultPins, pinCount, pinSlot, togglePin } from "./pins";

describe("pins", () => {
  it("pins into the first free slot and keeps the others where they are", () => {
    let pins = togglePin(EMPTY_PINS, "a");
    pins = togglePin(pins, "b");
    pins = togglePin(pins, "a");
    pins = togglePin(pins, "c");
    // "c" takes the slot "a" freed, so "b" keeps its colour.
    expect(pins).toEqual(["c", "b", null, null]);
    expect(pinSlot(pins, "b")).toBe(1);
  });

  it("leaves full pins unchanged", () => {
    const full = ["a", "b", "c", "d"];
    expect(togglePin(full, "e")).toBe(full);
    expect(pinCount(full)).toBe(4);
  });

  it("opens on the three highest series and skips ones that never traded", () => {
    const pins = defaultPins([
      { outcomeName: "low", lastPrice: 0.1 },
      { outcomeName: "never", lastPrice: null },
      { outcomeName: "high", lastPrice: 0.9 },
      { outcomeName: "mid", lastPrice: 0.5 },
      { outcomeName: "mid-2", lastPrice: 0.4 },
    ]);
    expect(pins).toEqual(["high", "mid", "mid-2", null]);
  });
});
