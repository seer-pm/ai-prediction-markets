import { Spinner, Tooltip } from "@/components/ui";
import { RefreshIcon } from "@/components/ui/icons";
import { TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { useRefreshMarketVolume } from "@/hooks/useMarketCharts";
import { cn } from "@/utils/cn";
import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * When a finished run is asked about again.
 *
 * The subgraph these totals come from is a few blocks behind the chain, and the pool entity it
 * aggregates is only written when the swap is indexed — so asking the instant the receipt lands
 * returns the pre-run figure. Twice: once inside the window a healthy gateway needs, once far
 * enough out to cover a slow one. Each answer overwrites the last and the totals only ever grow, so
 * a second call that lands on the same number costs nothing but a second of lambda.
 */
const AFTER_RUN_DELAYS = [10_000, 30_000];

/**
 * Recomputes the volume figure it sits next to.
 *
 * Everything else on these tabs is as fresh as the chain; the volume is not, because it is written
 * by a 15-minute cron (`get-charts-background`) along with the whole chart series. Someone who has
 * just traded looks straight at this number, so it gets a way to ask — `refresh-market-volume`
 * recalculates it from the pools' running totals in about a second and shares the result, rather
 * than the tab waiting out the cron.
 *
 * It also asks on its own once a run settles, which is the case worth not making anyone click for:
 * the reader has just traded, is looking at the figure their own trade moved, and a number that has
 * not moved reads as a bug rather than as a cron they cannot see. The button is what knows *which*
 * markets the figure covers — the L1 and Octant cards sum a fixed pair, Originality sums ninety-
 * eight, the NU7 card sums whichever question is selected — so the run hooks signal only that they
 * have finished, through `TRADE_RUN_MUTATION_KEY`, and this decides what that means for the figure
 * on screen. The refresh runs on failure too: a run that reverted or was pruned can still have
 * moved pools.
 *
 * The series are left as they are. They move visibly on their own, and rebuilding them is the slow
 * part of the job.
 */
export function RefreshVolumeButton({ marketIds }: { marketIds: string[] }) {
  const { mutate, isPending, isError, error } = useRefreshMarketVolume();
  const runsInFlight = useIsMutating({ mutationKey: TRADE_RUN_MUTATION_KEY });

  // Read at fire time, not captured as a dependency: several tabs rebuild this array every render
  // (`selected ? [selected] : []`), and a dependency on it would tear down the pending timers on the
  // very next render and leave the refresh unfired.
  const marketIdsRef = useRef(marketIds);
  marketIdsRef.current = marketIds;

  const sawRun = useRef(false);

  useEffect(() => {
    if (runsInFlight > 0) {
      sawRun.current = true;
      return;
    }
    // Nothing has run since this mounted — don't refresh on arrival, the chart request just did.
    if (!sawRun.current) return;
    sawRun.current = false;

    const timers = AFTER_RUN_DELAYS.map((delay) =>
      setTimeout(() => {
        if (marketIdsRef.current.length) mutate(marketIdsRef.current);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [runsInFlight, mutate]);

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
