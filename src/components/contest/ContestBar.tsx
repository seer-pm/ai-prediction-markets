import { Button, Card } from "@/components/ui";
import { TrashIcon, UploadIcon } from "@/components/ui/icons";
import type { ReactNode } from "react";

interface ContestBarProps {
  predictionCount: number;
  onUpload: () => void;
  onClear?: () => void;
  /** Contest-specific trade actions, already gated by wallet readiness. */
  actions?: ReactNode;
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
}: ContestBarProps) {
  const hasPredictions = predictionCount > 0;

  return (
    <Card className="flex flex-col gap-4 !px-6 !py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body text-ink-3">
          {hasPredictions ? (
            <>
              <span className="font-mono font-bold text-ink">{predictionCount}</span>{" "}
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

      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </Card>
  );
}
