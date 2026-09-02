import { useIsFetching, useIsMutating, useIsRestoring } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** How long everything has to stay quiet before we call the page settled. */
const SETTLE_MS = 1500;

/**
 * True once the page has nothing left in flight — the moment it is fair to start expensive work
 * nobody asked for.
 *
 * This is what keeps the redeemable scan off the critical path. On load there are always
 * market-data queries running, so a query gated on this cannot be the thing that makes first paint
 * slower; it runs in the gap afterwards instead.
 *
 * Three conditions, and the third is the one that is easy to miss: `PersistQueryClientProvider`
 * renders its children *while* it rehydrates the persisted cache, and during that window no
 * query has started yet — so `useIsFetching()` and `useIsMutating()` are both 0 and the page looks
 * idle at t=0, before it has done anything at all. Restoring reads a sizeable snapshot out of
 * IndexedDB, so that window is not always short. `useIsRestoring` closes it.
 *
 * Latched: once true it stays true. Callers use it to *enable* a query, and a background refetch
 * flipping it back would disable that query mid-flight and throw away the answer.
 */
export function usePageIdle(settleMs = SETTLE_MS): boolean {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const isRestoring = useIsRestoring();
  const [idle, setIdle] = useState(false);
  const latched = useRef(false);

  useEffect(() => {
    if (latched.current) return;
    if (isRestoring || fetching > 0 || mutating > 0) return;

    const timer = setTimeout(() => {
      latched.current = true;
      setIdle(true);
    }, settleMs);
    return () => clearTimeout(timer);
  }, [fetching, mutating, isRestoring, settleMs]);

  return idle;
}
