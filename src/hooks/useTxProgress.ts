import type { TxPhase, TxProgress } from "@/types";
import { useCallback, useRef, useState } from "react";

export interface TxProgressState {
  /** The stage running right now. */
  current?: TxProgress;
  /** Every stage that has been entered, in order. */
  completed: TxPhase[];
  onStateChange: (progress: TxProgress) => void;
  reset: () => void;
}

/**
 * Collects the progress stream from a batched run into something a ledger can
 * render. Previously each hook kept a single `useState<string>` that the next
 * message overwrote, so a five-minute run showed one line of text and no
 * indication of how much was left.
 */
export function useTxProgress(): TxProgressState {
  const [current, setCurrent] = useState<TxProgress>();
  const [completed, setCompleted] = useState<TxPhase[]>([]);
  const seen = useRef<Set<TxPhase>>(new Set());

  const onStateChange = useCallback((progress: TxProgress) => {
    setCurrent(progress);
    if (!seen.current.has(progress.phase)) {
      seen.current.add(progress.phase);
      setCompleted((phases) => [...phases, progress.phase]);
    }
  }, []);

  const reset = useCallback(() => {
    seen.current = new Set();
    setCurrent(undefined);
    setCompleted([]);
  }, []);

  return { current, completed, onStateChange, reset };
}
