import { cn } from "@/utils/cn";

interface DeltaCellProps {
  value: number | null | undefined;
  /** Largest absolute delta in the loaded set — scales every bar in the table. */
  max: number;
  /** How the number itself reads. Defaults to a signed 4-decimal weight. */
  format: (value: number) => string;
  title?: string;
  className?: string;
}

const TRACK = 72;
const MIN_FILL = 2;

/**
 * The delta gutter.
 *
 * A prediction is only useful relative to the market, so the difference column
 * is drawn as well as printed: a bar growing right from a centre spine when
 * the market underprices the outcome (buy), left when it overprices it (sell),
 * scaled against the largest delta in the set. Down a 200-row table the spine
 * reads as a single line and the bars show the shape of the edge at a glance.
 *
 * The sign glyph is always present, so colour is never the only channel.
 */
export function DeltaCell({ value, max, format, title, className }: DeltaCellProps) {
  const hasValue = typeof value === "number" && !Number.isNaN(value) && value !== 0;

  if (!hasValue) {
    return (
      <div className={cn("flex items-center justify-end gap-2.5", className)}>
        <span aria-hidden className="block shrink-0" style={{ width: TRACK }}>
          <span className="mx-auto block h-4 w-px bg-rule" />
        </span>
        <span className="font-mono text-body text-ink-4">—</span>
      </div>
    );
  }

  const positive = value > 0;
  const ratio = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  const fill = Math.max(MIN_FILL, ratio * (TRACK / 2));

  return (
    <div className={cn("flex items-center justify-end gap-2.5", className)} title={title}>
      <span aria-hidden className="relative block h-4 shrink-0" style={{ width: TRACK }}>
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-rule-strong" />
        <span
          className={cn(
            "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-[2px]",
            positive ? "left-1/2 bg-long" : "right-1/2 bg-short",
          )}
          style={{ width: fill }}
        />
      </span>
      <span
        className={cn("font-mono text-body font-semibold", positive ? "text-long" : "text-short")}
      >
        {format(value)}
      </span>
    </div>
  );
}
