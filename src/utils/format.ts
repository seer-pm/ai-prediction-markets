import { formatUnits, parseUnits } from "viem";

/**
 * One place for every number the user reads.
 *
 * Tables used to print `toFixed(8)` walls next to `toFixed(2)` balances, so a
 * 200-row diff was impossible to scan. Everything here is grouped, tabular and
 * truncated to a readable precision; the untruncated value goes in a `title`
 * via `preciseValue` so nothing is actually lost.
 */

const EM_DASH = "—";
const MINUS = "−";

const grouped = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

const weightFormatter = grouped(4, 4);
const collateralFormatter = grouped(2, 2);
const percentFormatter = grouped(2, 2);

/** Market weights / prices: 4 decimals is enough to act on, 8 was noise. */
export function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return weightFormatter.format(value);
}

/** Signed delta with an explicit sign glyph — colour is never the only channel. */
export function formatSignedWeight(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return EM_DASH;
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${weightFormatter.format(Math.abs(value))}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return percentFormatter.format(value);
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return EM_DASH;
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${percentFormatter.format(Math.abs(value))}`;
}

/** Token / collateral amounts, grouped to 2dp. */
export function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return EM_DASH;
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return EM_DASH;
  return collateralFormatter.format(n);
}

export function formatTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
): string {
  if (typeof value !== "bigint") return EM_DASH;
  return collateralFormatter.format(Number(formatUnits(value, decimals)));
}

/** Full precision for `title` attributes, so truncation never hides a value. */
export function preciseValue(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || Number.isNaN(value)) return undefined;
  return value.toString();
}

export function preciseTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
): string | undefined {
  if (typeof value !== "bigint") return undefined;
  return formatUnits(value, decimals);
}

export function formatAddress(address: string | null | undefined, lead = 6, tail = 4): string {
  if (!address) return EM_DASH;
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** "1 market" / "12 markets" — used constantly in preflight summaries. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Rough wall-clock estimate for a batched run, phrased loosely on purpose. */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return "under a minute";
  return `about ${Math.round(seconds / 60)} min`;
}

/**
 * `parseUnits` throws on "", "-" and other in-progress input, which several
 * live-preview queries used to call on every keystroke.
 */
export function safeParseUnits(value: string | undefined, decimals: number): bigint {
  if (!value) return 0n;
  try {
    const parsed = parseUnits(value, decimals);
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

/** Largest absolute value in a set — scales every delta bar in a table consistently. */
export function maxAbs(values: Array<number | null | undefined>): number {
  let max = 0;
  for (const value of values) {
    if (typeof value !== "number" || Number.isNaN(value)) continue;
    const abs = Math.abs(value);
    if (abs > max) max = abs;
  }
  return max;
}

export { EM_DASH, MINUS };
