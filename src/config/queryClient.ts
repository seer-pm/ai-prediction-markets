import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

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

export const localStoragePersister = createAsyncStoragePersister({
  storage: window.localStorage,
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
  "useTokensBalances", // L2 table balances
  "useTokenBalance", // sUSDS wallet balance
  // Persist the executor-check queries so predictedAddress is restored from
  // localStorage on reload (no network round-trip). The balance queries are
  // keyed by predictedAddress, so without this their persisted cache can't be
  // matched at mount and they fall back to the loading container.
  "useCheckTradeExecutorCreated",
  "useCheckOldTradeExecutorCreated",
]);

export const shouldDehydrateQuery = (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) =>
  defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEYS.has(query.queryKey[0] as string);
