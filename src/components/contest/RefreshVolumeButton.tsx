import { Spinner, Tooltip } from "@/components/ui";
import { RefreshIcon } from "@/components/ui/icons";
import { useRefreshMarketVolume } from "@/hooks/useMarketCharts";
import { cn } from "@/utils/cn";

/**
 * Recomputes the volume figure it sits next to.
 *
 * Everything else on these tabs is as fresh as the chain; the volume is not, because it is written
 * by a 15-minute cron (`get-charts-background`) along with the whole chart series. Someone who has
 * just traded looks straight at this number, so it gets a way to ask — `refresh-market-volume`
 * recalculates it from the pools' running totals in about a second and shares the result, rather
 * than the tab waiting out the cron.
 *
 * The series are left as they are. They move visibly on their own, and rebuilding them is the slow
 * part of the job.
 */
export function RefreshVolumeButton({ marketIds }: { marketIds: string[] }) {
  const { mutate, isPending, isError, error } = useRefreshMarketVolume();

  if (marketIds.length === 0) return null;

  return (
    <Tooltip content={isError ? (error as Error).message : "Recalculate volume now"}>
      <button
        type="button"
        aria-label="Refresh volume"
        disabled={isPending}
        onClick={() => mutate(marketIds)}
        className={cn(
          "inline-flex size-6 cursor-pointer items-center justify-center rounded-md border border-transparent transition-colors",
          "text-ink-3 hover:bg-sunken hover:text-ink disabled:cursor-default disabled:hover:bg-transparent",
          isError && "text-short",
        )}
      >
        {isPending ? (
          <Spinner size={12} label="Refreshing volume" />
        ) : (
          <RefreshIcon width={12} height={12} />
        )}
      </button>
    </Tooltip>
  );
}
