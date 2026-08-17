import { resolveEnsName } from "@/config/ens";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { isAddress } from "viem";

/** A day: primary names change about as often as people change their handle. */
const STALE_TIME = 24 * 60 * 60 * 1000;

/**
 * Primary ENS names for a list of addresses, keyed by lowercased address. Addresses without a name
 * (the common case for freshly created agent wallets) are simply absent from the result.
 *
 * One query per address rather than one query for the list: per-address keys mean a name resolved
 * on page 1 is still there on page 2, under a different contest scope, and after a search — a
 * list-shaped key would miss on every navigation. React Query dedupes identical keys across
 * callers, and `resolveEnsName` bounds concurrency with a shared limiter.
 */
export function useEnsNames(addresses: string[]): Record<string, string> {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    for (const address of addresses) {
      if (address && isAddress(address)) seen.add(address.toLowerCase());
    }
    return [...seen].sort();
  }, [addresses]);

  return useQueries({
    queries: unique.map((address) => ({
      // `useEnsName` is in PERSISTED_QUERY_KEYS (see src/config/queryClient.ts), so names paint
      // from localStorage on revisit instead of being re-resolved.
      queryKey: ["useEnsName", address],
      queryFn: () => resolveEnsName(address),
      staleTime: STALE_TIME,
      gcTime: Infinity,
      retry: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
    // `combine` keeps the returned map referentially stable while the underlying queries don't
    // change, so the memoized table body isn't re-rendered on every parent render.
    combine: (results) => {
      const names: Record<string, string> = {};
      results.forEach((result, index) => {
        if (result.data) names[unique[index]] = result.data;
      });
      return names;
    },
  });
}
