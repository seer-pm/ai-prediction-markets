import { Button, Card, CardHeader, EmptyState, ErrorPanel } from "@/components/ui";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { useLeaderboardStore } from "@/stores/leaderboardStore";
import { useMemo } from "react";
import { LeaderboardTable } from "./LeaderboardTable";

const TOP_N = 10;

interface ContestLeaderboardCardProps {
  contestId: string;
}

/**
 * Top traders for one contest, all-time.
 *
 * Sits under each contest's table so the ranking is where the contest is; the period control,
 * search and paging live on the Leaderboard tab.
 */
export function ContestLeaderboardCard({ contestId }: ContestLeaderboardCardProps) {
  const { account, tradeExecutor } = useTradeWalletStatus();
  const openLeaderboard = useLeaderboardStore((state) => state.openLeaderboard);
  const query = useLeaderboard({ scope: contestId, period: "all", limit: TOP_N, offset: 0 });

  const ownAddresses = useMemo(
    () => [account, tradeExecutor].filter(Boolean) as string[],
    [account, tradeExecutor],
  );

  if (query.error) {
    return <ErrorPanel title="Top traders could not be loaded" error={query.error} />;
  }

  return (
    <Card flush>
      <CardHeader
        eyebrow="Leaderboard"
        title="Top traders"
        description="Profit in this contest and its child markets, in sUSDS."
        actions={
          <Button size="sm" variant="ghost" onClick={() => openLeaderboard(contestId)}>
            View full leaderboard
          </Button>
        }
      />
      <LeaderboardTable
        compact
        rows={query.data?.rows ?? []}
        isLoading={query.isLoading}
        ownAddresses={ownAddresses}
        emptyState={
          <EmptyState
            title="No ranked wallets yet"
            description="Rankings appear once the refresh job has scored this contest's traders."
          />
        }
      />
    </Card>
  );
}
