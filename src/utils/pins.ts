/**
 * The series a reader follows on a chart, one per colour slot (`--seer-series-1` … `-4`). A slot
 * keeps its series until it is unpinned, so a colour stays on its entity while others come and go.
 */
export type Pins = readonly (string | null)[];

/** The kit validates four series colours as a set; past that, a series stays muted context. */
export const MAX_PINS = 4;

/** How many the chart follows before the reader picks any: the leaders, with a slot to spare. */
const DEFAULT_PIN_COUNT = 3;

export const EMPTY_PINS: Pins = Array.from({ length: MAX_PINS }, () => null);

export function pinSlot(pins: Pins, name: string): number | null {
  const slot = pins.indexOf(name);
  return slot === -1 ? null : slot;
}

export function pinCount(pins: Pins): number {
  return pins.filter((name) => name !== null).length;
}

/** Unpins a followed series, or pins it into the first free slot. Full pins stay as they are. */
export function togglePin(pins: Pins, name: string): Pins {
  const slot = pinSlot(pins, name);
  if (slot !== null) return pins.map((pinned, index) => (index === slot ? null : pinned));
  const free = pins.indexOf(null);
  if (free === -1) return pins;
  return pins.map((pinned, index) => (index === free ? name : pinned));
}

/** The series with the highest latest value, so a chart opens on the field's leaders. */
export function defaultPins(series: ReadonlyArray<{ outcomeName: string; lastPrice: number | null }>): Pins {
  const leaders = [...series]
    .filter((entry) => entry.lastPrice !== null)
    .sort((a, b) => (b.lastPrice ?? 0) - (a.lastPrice ?? 0) || a.outcomeName.localeCompare(b.outcomeName))
    .slice(0, DEFAULT_PIN_COUNT)
    .map((entry) => entry.outcomeName);
  return EMPTY_PINS.map((_, index) => leaders[index] ?? null);
}
