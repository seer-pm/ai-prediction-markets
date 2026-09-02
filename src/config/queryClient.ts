import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      staleTime: 5 * 60 * 1000,
    },
  },
});

// Persisted queries (e.g. token balances) hold native BigInt values, which the
// default JSON.stringify serializer cannot handle — it throws and aborts the
// entire persist write, so nothing (including market data) ever reaches
// localStorage. Tag bigints as a sentinel string on the way out and revive them
// back to real bigint on the way in, so the whole cache round-trips intact.
const BIGINT_TAG = "$bigint:";

const replacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? `${BIGINT_TAG}${value}` : value;

const reviver = (_key: string, value: unknown) =>
  typeof value === "string" && value.startsWith(BIGINT_TAG)
    ? BigInt(value.slice(BIGINT_TAG.length))
    : value;

/**
 * IndexedDB, not localStorage.
 *
 * localStorage's ~5MB ceiling is a hard wall: one oversized entry makes `setItem` throw
 * QuotaExceededError, which aborts the *whole* persist, so nothing at all is restored on reload.
 * Chart history used to blow past it, and the workaround — stripping charts out of the snapshot —
 * meant every market-data query had to refetch on mount to fill the hole back in.
 *
 * Charts are now precomputed and small, but the browsing pattern still accumulates: forty L2
 * repositories and thirty-seven Zcash proposals each cache their own series. IndexedDB has room for
 * that, and the async persister already speaks to a promise-based store, so this is a drop-in.
 */
const idbStorage = {
  getItem: (key: string) => get<string>(key).then((value) => value ?? null),
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  serialize: (client) => JSON.stringify(client, replacer),
  deserialize: (cached) => JSON.parse(cached, reviver),
});

// Query keys whose data we persist to localStorage so it renders instantly on revisit
// (and is then refreshed in the background by the hooks' refetchOnMount).
const PERSISTED_QUERY_KEYS = new Set([
  "useMarketsData", // Round 1
  "useL1MarketsData", // Round 2 L1
  "fetchOriginalityMarketsData", // Round 2 Originality
  "fetchL2MarketsData", // Round 2 L2 (default tab)
  "fetchZcashMarketsData", // Zcash Q3 2026
  // Chart history, one entry per market. Small enough to keep now that the series arrive
  // precomputed — see `useMarketCharts`.
  "marketChart",
  "useTokensBalances", // L2 table balances
  "useTokenBalance", // sUSDS wallet balance
  // Persist the executor-check queries so predictedAddress is restored from
  // localStorage on reload (no network round-trip). The balance queries are
  // keyed by predictedAddress, so without this their persisted cache can't be
  // matched at mount and they fall back to the loading container.
  "useCheckTradeExecutorCreated",
  "useCheckOldTradeExecutorCreated",
  // Leaderboard ENS names. Safe to restore stale, unlike the deliberately-unpersisted
  // `useLeaderboard` rank: a primary name is a cosmetic label, not a claimed fact.
  "useEnsName",
  // Wallet profiles, for the same reason. These store URLs, never image bytes, so they cost the
  // storage budget almost nothing.
  "useProfiles",
]);

export const shouldDehydrateQuery = (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) =>
  defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEYS.has(query.queryKey[0] as string);

/**
 * Bump on any change to what a persisted query's data *means* — not just its shape.
 *
 * A restored snapshot is typed as the *current* shape but was written by whatever build stored it,
 * so a field added since then is missing at runtime and every unguarded read of it throws on first
 * paint — which is exactly how the L1 panel died when `parentMarket`/`otherMarket` were added.
 * A new buster makes the persister discard the old snapshot instead.
 *
 * Values count too, and that case is easier to miss because nothing crashes. Fixing how chart series
 * are resampled left every client rendering its stored copy of the old curve, and a hard refresh does
 * not help: IndexedDB survives it. The chart looked unfixed long after the fix shipped.
 */
export const PERSIST_BUSTER = "charts-series-v2";
