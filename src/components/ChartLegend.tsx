import { ScrollFade } from "@/components/ui/ScrollFade";
import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";
import { MAX_PINS } from "@/utils/pins";
import { useMemo, useState } from "react";

export interface LegendEntry {
  /** Index into the chart's series array, which the hover highlight keys on. */
  index: number;
  name: string;
  /** The colour slot (0 to 3) of a followed series, or null for one drawn as context. */
  slot: number | null;
  /** Latest price for this outcome, or null if it never traded. */
  value: number | null;
}

interface ChartLegendProps {
  entries: LegendEntry[];
  hovered: number | null;
  onToggle: (name: string) => void;
  onClear: () => void;
  onHover: (index: number | null) => void;
  formatValue: (value: number) => string;
}

/**
 * The series list, beside the chart rather than above it.
 *
 * These contests run dozens of outcomes at once, more than any palette can tell apart, so every
 * series is drawn as muted context and the reader follows up to four in colour. The list is sorted
 * by current price so the leaders stay on top, searchable, and hovering a row lifts its line out of
 * the field. Values stay in text colours; the swatch carries the series' identity.
 */
export function ChartLegend({
  entries,
  hovered,
  onToggle,
  onClear,
  onHover,
  formatValue,
}: ChartLegendProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const av = a.value ?? -Infinity;
        const bv = b.value ?? -Infinity;
        if (av !== bv) return bv - av;
        return a.name.localeCompare(b.name);
      }),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [sorted, query]);

  const following = entries.filter((entry) => entry.slot !== null).length;
  const full = following >= MAX_PINS;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <label className="seer-input-group shrink-0 min-h-10">
        <SearchIcon className="shrink-0 text-ink-3" width={15} height={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search outcomes"
          aria-label="Search outcomes"
          className="seer-input text-body"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-hidden" onMouseLeave={() => onHover(null)}>
        <ScrollFade className="h-full min-h-0">
          <ul className="grid grid-cols-1 gap-px pr-0.5 sm:grid-cols-2 md:grid-cols-1">
            {filtered.length === 0 && (
              <li className="px-2 py-1.5 text-body text-ink-3">No outcomes match.</li>
            )}

            {filtered.map((entry) => {
              const followed = entry.slot !== null;
              const blocked = full && !followed;
              const label = entry.value === null ? "—" : formatValue(entry.value);

              return (
                <li key={entry.index}>
                  <button
                    type="button"
                    title={blocked ? "Follow up to four at once" : entry.name}
                    aria-pressed={followed}
                    aria-disabled={blocked || undefined}
                    onClick={() => !blocked && onToggle(entry.name)}
                    onMouseEnter={() => onHover(entry.index)}
                    onFocus={() => onHover(entry.index)}
                    onBlur={() => onHover(null)}
                    className={cn(
                      "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                      hovered === entry.index ? "bg-sunken" : "hover:bg-sunken",
                      blocked && "cursor-not-allowed",
                    )}
                  >
                    {/* A filled bar in the series colour when followed, a hairline ring when not. */}
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        !followed && "border border-rule-strong",
                      )}
                      style={followed ? { background: `var(--seer-series-${entry.slot! + 1})` } : undefined}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-data",
                        followed ? "font-semibold text-ink" : "text-ink-2",
                      )}
                    >
                      {entry.name}
                    </span>
                    <span className="shrink-0 text-data text-ink-3">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollFade>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-rule pt-2">
        <span className="text-micro text-ink-3">
          Following {following} of {MAX_PINS}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={following === 0}
          className="seer-button seer-button-ghost seer-button-sm text-primary-text"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
