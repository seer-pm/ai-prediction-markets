import { LeaderboardPanel } from "@/components/leaderboard/LeaderboardPanel";
import { useLeaderboardStore } from "@/stores/leaderboardStore";

export const Leaderboard = () => {
  const scope = useLeaderboardStore((state) => state.scope);
  const requestId = useLeaderboardStore((state) => state.requestId);

  // Remount on each "View full leaderboard" so the panel adopts the requested market and drops
  // the previous search / page / period. Asking for the market you are already looking at still
  // resets, which is what that button implies.
  return <LeaderboardPanel key={requestId} initialScope={scope} />;
};
