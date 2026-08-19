import { fetchAppJson } from "@/utils/common";
import type { Profile } from "@/utils/profile";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isAddress } from "viem";

/** Profiles are edited rarely; a page's worth is one small request. */
const STALE_TIME = 5 * 60 * 1000;

interface ProfilesResponse {
  profiles: Record<string, Profile>;
}

/**
 * Display names, avatars and X handles for a list of addresses, keyed by lowercased address.
 * Wallets without a profile — most of them — are simply absent from the result.
 *
 * One batched request rather than `useEnsNames`' query-per-address: an ENS name costs a mainnet
 * round trip each, so per-address caching earns its keep there, while these all come from one
 * function call and splitting them into 25 would be 25 HTTP requests per page.
 *
 * The server canonicalises each address, so passing a trade-executor contract returns its owner's
 * profile — the identity the leaderboard ranks under.
 */
export function useProfiles(addresses: string[]): Record<string, Profile> {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    for (const address of addresses) {
      if (address && isAddress(address)) seen.add(address.toLowerCase());
    }
    return [...seen].sort();
  }, [addresses]);

  const { data } = useQuery({
    // Restored from localStorage on revisit (see `PERSISTED_QUERY_KEYS`), so names and avatars
    // paint with the first frame instead of arriving a beat after the numbers.
    queryKey: ["useProfiles", unique.join(",")],
    queryFn: () =>
      fetchAppJson<ProfilesResponse>(`get-profiles?addresses=${unique.join(",")}`),
    enabled: unique.length > 0,
    staleTime: STALE_TIME,
    // The client's default is `gcTime: Infinity`, which is wrong for a key built from the address
    // list: every sort, period, scope and page produces a distinct one, and persisted entries
    // would accumulate in localStorage forever. An hour is long past the point of usefulness.
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return data?.profiles ?? EMPTY;
}

/** Shared so the identity of the "no profiles" result is stable across renders. */
const EMPTY: Record<string, Profile> = {};
