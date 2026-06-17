/** Shared edge cache: serve cached response instantly, revalidate in background. */
export const EDGE_CACHE_HEADERS: Record<string, string> = {
  "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=600",
};
