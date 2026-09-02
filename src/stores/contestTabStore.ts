import { create } from "zustand";

type ContestTabStore = {
  /** A contest another part of the app wants opened, until `Tab` picks it up. */
  requestedTab: string | null;
  requestTab: (contestId: string) => void;
  clearRequest: () => void;
};

/**
 * A one-shot request to open a contest tab, for callers outside the tab bar.
 *
 * Deliberately holds a *request* and not the active tab itself. `Tab` keeps `activeTab` in React
 * state and switches it inside `startTransition`, so mounting a heavy contest panel does not block
 * the click; React de-opts to a synchronous blocking render when an external store is mutated
 * during a transition, so moving that state here would quietly delete the optimisation on every
 * tab click — not just the handful that come from elsewhere.
 *
 * Not persisted: a request is consumed on arrival, and restoring a stale one on the next visit
 * would yank the user to a tab they did not ask for.
 */
export const useContestTabStore = create<ContestTabStore>()((set) => ({
  requestedTab: null,
  requestTab: (contestId) => set({ requestedTab: contestId }),
  clearRequest: () => set({ requestedTab: null }),
}));
