/**
 * CORS for the public GET data functions so the frontend can call them cross-origin from
 * local dev and Netlify deploy/PR previews (the app fetches the production functions via
 * getAppUrl()). The allowed origin is echoed back (with `Vary: Origin`) only when it matches
 * the allowlist below — never a blanket `*`.
 */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  // Netlify deploy previews / branch deploys, e.g. deploy-preview-123--site.netlify.app
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/,
  // Production site and named subdomains, e.g. deep-pm.netlify.app
  /^https:\/\/[a-z0-9-]+\.netlify\.app$/,
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return {
      "Access-Control-Allow-Origin": origin,
      // Cache per-origin so the CDN doesn't serve one origin's ACAO header to another.
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  return {};
}

/** Returns a 204 preflight response when the request is an OPTIONS preflight, else null. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return null;
}
