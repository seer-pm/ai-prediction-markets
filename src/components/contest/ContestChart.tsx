import MarketChart from "@/components/MarketChart";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import type { ChartWithMarketData } from "@/types";
import type { ReactElement, ReactNode } from "react";

interface ContestChartProps {
  data: ChartWithMarketData | undefined;
  isLoading: boolean;
  eyebrow?: string;
  title: string;
  description?: string;
  volume?: string | ReactElement;
  actions?: ReactNode;
  /** How the legend reads each series' latest price. Weights by default. */
  formatValue?: (value: number) => string;
}

/** Chart card with real loading and empty states, shared by every contest tab. */
export function ContestChart({
  data,
  isLoading,
  eyebrow,
  title,
  description,
  volume,
  actions,
  formatValue,
}: ContestChartProps) {
  if (data && data.length > 0) {
    return (
      <MarketChart
        data={data}
        totalVolumeMarket={volume}
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
      {isLoading ? (
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
