/** Shared edge cache: serve cached response instantly, revalidate in background. */
export const EDGE_CACHE_HEADERS: Record<string, string> = {
  "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=600",
};

/**
 * Charts additionally get a plain `Cache-Control`, so the *browser* caches them too and a remount
 * within the minute costs nothing at all. The market-data functions deliberately don't: those carry
 * live prices and balances, where a stale-but-cached reply would be wrong rather than merely old.
 * Chart history is append-only, so a minute behind is invisible.
 */
export const CHART_CACHE_HEADERS: Record<string, string> = {
  ...EDGE_CACHE_HEADERS,
  "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
};
