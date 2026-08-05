import { cn } from "@/utils/cn";

export interface Segment {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "md";
}

/** Two or three mutually exclusive modes, e.g. Supply / Withdraw. */
export function SegmentedControl({
  segments,
  value,
  onChange,
  className,
  size = "md",
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-rule bg-sunken p-0.5",
        className,
      )}
    >
      {segments.map((segment) => {
        const active = segment.id === value;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.id)}
            className={cn(
              "cursor-pointer rounded-[3px] font-medium transition-colors",
              size === "sm" ? "px-3 py-1.5 text-body" : "px-4 py-2 text-body",
              active ? "bg-surface text-primary shadow-raised" : "text-ink-3 hover:text-ink",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
