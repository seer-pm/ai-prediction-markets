import { createContext, useContext } from "react";

export interface ContestState {
  /** True once the contest has ended and its markets are no longer traded. */
  finished: boolean;
}

export const ContestContext = createContext<ContestState>({ finished: false });

/**
 * Whether the surrounding contest is still running.
 *
 * Authored once in the nav (`TABS`) and read here, so a contest can't drift
 * out of step with the label it is filed under.
 */
export const useContest = () => useContext(ContestContext);
