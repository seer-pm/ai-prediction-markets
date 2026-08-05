import { Button } from "@/components/ui";
import { DownloadIcon } from "@/components/ui/icons";

interface ExportWeightsButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Sits in each market table's header rather than the contest bar — it acts on
 * what the table is showing, so it belongs with the table.
 */
export function ExportWeightsButton({ onClick, disabled }: ExportWeightsButtonProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      disabledReason={disabled ? "Market data is still loading." : undefined}
      iconLeft={<DownloadIcon />}
    >
      Export market weights
    </Button>
  );
}
