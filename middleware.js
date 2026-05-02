// Vercel Edge Middleware — geographic access control.
//
// Blocks all requests originating from Nigeria (NG) at the CDN edge,
// before any function code runs. Returns:
//   - HTTP 302 → /451  for page requests
//   - HTTP 451 JSON   for API requests
//
// Exempt paths (still reachable from NG):
//   - /451          (the restricted-access page itself, so the redirect works)
//   - /api/cron-*   (cron-job.org pings — platform IPs, not user traffic)
//   - /favicon.ico, /manifest.webmanifest (static metadata)
//
// Note: Vercel injects the visitor's country via the `x-vercel-ip-country`
// header (ISO 3166-1 alpha-2). Locally this header is missing, so the
// block silently passes during dev. To test, hit a deployed URL via VPN
// or override the header in a Vercel preview environment.
export const config = {
  // Match every path EXCEPT the explicit exemptions. Vercel uses
  // path-to-regexp syntax; the negative lookahead skips the exempt
  // prefixes entirely so middleware never even runs for them.
  matcher: '/((?!451|favicon\\.ico|manifest\\.webmanifest|api/cron-).*)',
};

// Geo-block disabled — empty set means the middleware is a no-op for
// every request. To re-enable later, add ISO 3166-1 alpha-2 codes:
//   const BLOCKED = new Set(['NG']);
const BLOCKED = new Set();

export default function middleware(request) {
  const country = request.headers.get('x-vercel-ip-country') || '';
  if (!BLOCKED.has(country.toUpperCase())) return;

  const url = new URL(request.url);

  // API requests get a JSON 451 so SPAs and clients fail cleanly.
  if (url.pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ error: 'geo_restricted', code: 451, country }),
      {
        status: 451,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }
    );
  }

  // Page requests redirect to the editorial 451 page.
  // Use a 307 (temporary) + Cache-Control: no-store so browsers don't
  // cache the redirect — important because if we later UNBLOCK this
  // country, cached 302s would keep sending users to /451 even after
  // the block is removed. Always re-evaluate at the edge.
  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL('/451', request.url).toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
