import { RefreshVolumeButton } from "@/components/contest/RefreshVolumeButton";
import MarketChart from "@/components/MarketChart";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import type { ChartSeries } from "@/types";
import type { ReactElement, ReactNode } from "react";

interface ContestChartProps {
  /**
   * `undefined` means the chart has not arrived yet; `[]` means it arrived with nothing to draw.
   * Every tab keeps that distinction, and this card depends on it — see the render below.
   */
  data: ChartSeries[] | undefined;
  isLoading: boolean;
  /**
   * The chart request's failure, if it failed. Without it a failed request is indistinguishable
   * from one still in flight — both have no data — and the card would skeleton forever.
   */
  error?: Error | null;
  eyebrow?: string;
  title: string;
  description?: string;
  volume?: string | ReactElement;
  /**
   * Current pool depth, printed beside the volume figure. Same source and same refresh, so the two
   * are always read at the same instant — which is why the refresh control stays attached to
   * `volume` rather than being duplicated here.
   */
  liquidity?: string | ReactElement;
  /**
   * The markets `volume` was summed over. Given them, the figure gets a refresh control — the only
   * thing on the card that is written by a cron rather than read live, so the only one worth a way
   * of asking again. See `RefreshVolumeButton`.
   */
  refreshMarketIds?: string[];
  actions?: ReactNode;
  /** How the legend reads each series' latest price. Weights by default. */
  formatValue?: (value: number) => string;
}

/** Chart card with real loading and empty states, shared by every contest tab. */
export function ContestChart({
  data,
  isLoading,
  error,
  eyebrow,
  title,
  description,
  volume,
  liquidity,
  refreshMarketIds,
  actions,
  formatValue,
}: ContestChartProps) {
  const volumeWithRefresh =
    volume && refreshMarketIds?.length ? (
      <span className="inline-flex items-center gap-1.5">
        {volume}
        <RefreshVolumeButton marketIds={refreshMarketIds} />
      </span>
    ) : (
      volume
    );

  if (data && data.length > 0) {
    return (
      <MarketChart
        data={data}
        totalVolumeMarket={volumeWithRefresh}
        liquidity={liquidity}
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        formatValue={formatValue}
      />
    );
  }

  return (
    <Card flush>
      <CardHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {error ? (
        <EmptyState title="The chart could not be loaded" description={error.message} />
      ) : /*
         * `!data` counts as loading, and not only `isLoading`. A chart query is disabled until the
         * tab knows which markets to ask about, and React Query derives `isLoading` as
         * `isPending && isFetching` — so a disabled query reports `false` while holding no data at
         * all. Keyed on `isLoading` alone this card announced "No price history yet" every time a
         * tab was opened, for as long as the market list took to arrive.
         */
        isLoading || !data ? (
        <div className="space-y-3 p-6">
          <Skeleton height={16} width="30%" />
          <Skeleton height={320} className="rounded-md" />
        </div>
      ) : (
        <EmptyState
          title="No price history yet"
          description="Prices appear here once these markets have traded."
        />
      )}
    </Card>
  );
}
