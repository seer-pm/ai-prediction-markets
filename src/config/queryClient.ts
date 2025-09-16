import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/query-persist-client-core";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      staleTime: 0,
    },
  },
});
export const localStoragePersister = createAsyncStoragePersister({
  storage: window.localStorage,
});
persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      return query.queryKey[0] === "useMarketsData";
    },
  },
});
