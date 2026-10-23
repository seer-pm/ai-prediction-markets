import { Button, Card } from "@/components/ui";
import { TrashIcon, UploadIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

interface ContestBarProps {
  predictionCount: number;
  onUpload: () => void;
  onClear?: () => void;
  /** Contest-specific trade actions, already gated by wallet readiness. */
  actions?: ReactNode;
  /**
   * A toolbar on the page between a contest's brief and its field, rather than a card of its own.
   * It costs one line instead of a padded box, which keeps the field's first rows in view.
   */
  bare?: boolean;
}

/**
 * The row that used to be a loose cluster of six differently-styled buttons
 * floating between the chart and the table. File actions on the left with the
 * count they act on, trade actions on the right.
 */
export function ContestBar({
  predictionCount,
  onUpload,
  onClear,
  actions,
  bare = false,
}: ContestBarProps) {
  const hasPredictions = predictionCount > 0;
  const layout = "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";

  const content = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* Its own line on a phone, so the file actions after it stay together on one row. */}
        <span className="text-body text-ink-3 max-sm:basis-full">
          {hasPredictions ? (
            <>
              <span className="font-bold text-ink">{predictionCount}</span>{" "}
              {predictionCount === 1 ? "prediction" : "predictions"} loaded
            </>
          ) : (
            "No predictions loaded"
          )}
        </span>

        <Button size="sm" onClick={onUpload} iconLeft={<UploadIcon />}>
          {hasPredictions ? "Replace file" : "Upload predictions"}
        </Button>

        {hasPredictions && onClear && (
          <Button size="sm" variant="ghost" onClick={onClear} iconLeft={<TrashIcon />}>
            Clear
          </Button>
        )}
      </div>

      {/* `empty:hidden` because `actions` is a fragment whose children gate themselves — on a
          finished contest with nothing to redeem every one renders false, and the wrapper
          would otherwise still claim a `gap-4` row of its own on narrow screens. */}
      {actions && (
        <div className="flex flex-wrap items-center gap-3 empty:hidden">{actions}</div>
      )}
    </>
  );

  if (bare) return <div className={cn(layout, "border-y border-rule py-3")}>{content}</div>;
  return <Card className={cn(layout, "!px-6 !py-4")}>{content}</Card>;
}
