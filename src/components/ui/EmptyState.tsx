import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Dashed frame — use when the area itself is a drop target. */
  dashed?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * An empty screen is an invitation to act, so every one of these carries the
 * next step. The tables used to render `null` at zero rows, leaving a blank
 * page with no explanation.
 */
export function EmptyState({
  title,
  description,
  actions,
  dashed = false,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        dashed && "m-6 rounded-lg border-2 border-dashed border-rule-strong",
        className,
      )}
    >
      <div className="max-w-md space-y-1.5">
        <p className="text-lede font-semibold text-ink">{title}</p>
        {description && <p className="text-body text-ink-3">{description}</p>}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
