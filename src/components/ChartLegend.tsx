import { ScrollFade } from "@/components/ui/ScrollFade";
import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";
import { readableTextColor } from "@/utils/color";
import { useMemo, useState } from "react";

export interface LegendEntry {
  /** Index into the chart's series array — the toggle key. */
  index: number;
  name: string;
  color: string;
  /** Latest price for this outcome, or null if it never traded. */
  value: number | null;
}

interface ChartLegendProps {
  entries: LegendEntry[];
  /** Indices currently drawn on the chart. */
  visible: Set<number>;
  hovered: number | null;
  onToggle: (index: number) => void;
  onToggleAll: (nextVisible: boolean) => void;
  onHover: (index: number | null) => void;
  formatValue: (value: number) => string;
}

/**
 * The series list, beside the chart rather than above it.
 *
 * These contests run 40+ outcomes at once, which a wrapped row of chips can't
 * hold. A bounded column with its own search gives every series a stable
 * position, sorted by current price so the leaders are always at the top, and
 * hovering one dims the rest so a single line can be picked out of the tangle.
 */
export function ChartLegend({
  entries,
  visible,
  hovered,
  onToggle,
  onToggleAll,
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

  const anyVisible = visible.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-rule bg-sunken p-3">
      <div className="flex shrink-0 items-center gap-2 rounded-md border border-rule-strong bg-surface px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-rule">
        <SearchIcon className="shrink-0 text-ink-4" width={15} height={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search outcomes"
          aria-label="Search outcomes"
          className="w-full bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink-4"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" onMouseLeave={() => onHover(null)}>
        <ScrollFade className="h-full min-h-0">
          <div className="grid grid-cols-2 gap-1 pr-0.5 sm:grid-cols-3 md:grid-cols-1">
            {filtered.length === 0 && (
              <p className="px-1 py-1 text-body text-ink-4">No outcomes match.</p>
            )}

            {filtered.map((entry) => {
              const isVisible = visible.has(entry.index);
              const isHovered = hovered === entry.index;
              const label = entry.value === null ? "—" : formatValue(entry.value);

              return (
                <button
                  key={entry.index}
                  type="button"
                  title={`${entry.name} · ${label}`}
                  aria-pressed={isVisible}
                  onClick={() => onToggle(entry.index)}
                  onMouseEnter={() => onHover(entry.index)}
                  onFocus={() => onHover(entry.index)}
                  className={cn(
                    "flex w-full min-w-0 cursor-pointer items-baseline gap-2 overflow-hidden rounded px-2 py-1.5 text-left shadow-raised transition-opacity",
                    isVisible ? "opacity-100" : "opacity-35",
                    isHovered && "ring-2 ring-ink ring-offset-1 ring-offset-sunken",
                  )}
                  style={{
                    backgroundColor: entry.color,
                    color: readableTextColor(entry.color),
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-micro font-medium">{entry.name}</span>
                  <span className="shrink-0 font-mono text-micro font-semibold tabular-nums">{label}</span>
                </button>
              );
            })}
          </div>
        </ScrollFade>
      </div>

      <button
        type="button"
        onClick={() => onToggleAll(!anyVisible)}
        className="shrink-0 cursor-pointer text-left text-body font-medium text-primary transition-colors hover:text-primary-hover"
      >
        {anyVisible ? "Hide all" : "Show all"}
      </button>
    </div>
  );
}
