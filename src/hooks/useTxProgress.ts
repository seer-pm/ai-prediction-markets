import type { TxPhase, TxProgress } from "@/types";
import { useCallback, useRef, useState } from "react";

export interface TxProgressState {
  /** The stage running right now. */
  current?: TxProgress;
  /** Every stage that has been entered, in order. */
  completed: TxPhase[];
  /** Stages the run reported as having nothing to do, each with the reason it gave. */
  skipped: TxProgress[];
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
  const [skipped, setSkipped] = useState<TxProgress[]>([]);
  const seen = useRef<Set<TxPhase>>(new Set());

  const onStateChange = useCallback((progress: TxProgress) => {
    // A skipped stage still advances the run — it becomes `current` so the stages before it settle
    // — the ledger just draws it as passed over rather than as work in flight.
    setCurrent(progress);
    if (progress.skipped) {
      // Kept whole, not just the phase name: the reason ("Nothing is priced below your weights")
      // has to outlive `current`, or it vanishes the moment the run moves on to the next stage.
      setSkipped((entries) =>
        entries.some((entry) => entry.phase === progress.phase) ? entries : [...entries, progress],
      );
    }
    if (!seen.current.has(progress.phase)) {
      seen.current.add(progress.phase);
      setCompleted((phases) => [...phases, progress.phase]);
    }
  }, []);

  const reset = useCallback(() => {
    seen.current = new Set();
    setCurrent(undefined);
    setCompleted([]);
    setSkipped([]);
  }, []);

  return { current, completed, skipped, onStateChange, reset };
}
