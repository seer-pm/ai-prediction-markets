/** Shared edge cache: serve cached response instantly, revalidate in background. */
export const EDGE_CACHE_HEADERS: Record<string, string> = {
  "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=600",
};

/**
 * Charts additionally get a plain `Cache-Control` — but one that revalidates every time.
 *
 * The browser used to hold these for a minute, back when a remount meant a fresh request and the
 * cheapest fix was to let the HTTP cache absorb it. The client now keeps chart history in IndexedDB
 * indefinitely and only ever fetches to *replace* what it is already showing (see
 * `useMarketCharts`), so a second cache in front of that one has nothing left to save — it only
 * decides how old the replacement is allowed to be. `stale-while-revalidate` was actively wrong
 * here: it hands back the stale body and refreshes the browser's copy for next time, which leaves
 * the rendered chart permanently one fetch behind.
 *
 * The edge still serves instantly and revalidates behind itself, so revalidating on every request
 * costs a round trip to the CDN, not a rebuild.
 */
export const CHART_CACHE_HEADERS: Record<string, string> = {
  ...EDGE_CACHE_HEADERS,
  "Cache-Control": "public, max-age=0, must-revalidate",
};
