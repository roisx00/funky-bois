// Vercel Blob client-uploads handshake. The browser SDK (`upload()`
// from @vercel/blob/client) calls THIS endpoint twice:
//
//   1. ask for an upload token (we sign one scoped to this user +
//      the allowed image types + a 5-min expiry).
//   2. notify us the upload completed (we don't persist anything
//      here; the actual submission row is created by /api/art-submit
//      once the user clicks "submit" with the resulting blob URL).
//
// The token is server-issued, single-tenant, and rate-limited so an
// approved attacker still can't drain the bucket.
import { requireActiveUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'art_upload_url', max: 20, windowSecs: 3600 }))) return;

  let handleUpload;
  try {
    ({ handleUpload } = await import('@vercel/blob/client'));
  } catch {
    return bad(res, 500, 'blob_sdk_unavailable');
  }

  // Read the raw body once — the SDK helper expects a Request-like obj
  // with a json() method.
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const bodyText = Buffer.concat(chunks).toString('utf8');
  let body;
  try { body = JSON.parse(bodyText); } catch { return bad(res, 400, 'invalid_body'); }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Force the path under art/<user_id>/ regardless of what the
        // client claims, so users can't write into each other's
        // namespaces.
        const safe = `art/${user.id}/${Date.now()}-${pathname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)}`;
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes:  6 * 1024 * 1024, // 6MB
          tokenPayload:        JSON.stringify({ userId: user.id, pathname: safe }),
          addRandomSuffix:     true,
          pathname:            safe,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // We don't persist here — the user must POST to /api/art-submit
        // with the blob URL. This callback exists so the SDK is happy.
        console.log('[art-upload] uploaded', blob?.url);
      },
    });
    return ok(res, result);
  } catch (e) {
    console.warn('[art-upload] error:', e?.message);
    return bad(res, 400, 'upload_failed', { hint: e?.message });
  }
}
