import { create } from "zustand";

type LeaderboardStore = {
  /** `global`, or a contest id from `@/utils/contests`. */
  scope: string;
  /** Bumped on every request so the tab bar can react even to a repeat of the same scope. */
  requestId: number;
  openLeaderboard: (scope: string) => void;
};

/**
 * Lets a contest's "View full leaderboard" button switch the top-level tab and preselect its
 * market. There is no router in this app, and the five contest components take no props — a
 * one-field store beats threading a callback through all of them.
 */
export const useLeaderboardStore = create<LeaderboardStore>()((set) => ({
  scope: "global",
  requestId: 0,
  openLeaderboard: (scope) => set((state) => ({ scope, requestId: state.requestId + 1 })),
}));
