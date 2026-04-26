// User-initiated collaboration application.
//
// Body: {
//   communityName, communityUrl, communitySize, category,
//   raidLink,                   // X post URL (raid post about The 1969)
//   message,                    // optional pitch
//   bannerMime, bannerB64       // required image (PNG/JPG/WEBP)
// }
//
// Auth: cookie (X-authed, non-suspended).
//
// Rules:
//   1. One ACTIVE application per user (status pending OR approved).
//   2. raidLink required + must be a valid URL. We additionally
//      check the host looks like X (twitter.com / x.com) — non-X
//      raids aren't accepted in this iteration.
//   3. Banner required. ≤4MB after decode. Stored inline as BYTEA.
//   4. raid_platform always 'x' for new applications.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BANNER_BYTES = 4 * 1024 * 1024;

const MAX_NAME = 100;
const MAX_URL  = 300;
const MAX_MSG  = 500;
const MAX_CAT  = 50;

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'collab_apply', max: 5, windowSecs: 86400 }))) return;

  const body = (await readBody(req)) || {};
  const communityName = trim(body.communityName, MAX_NAME);
  const communityUrl  = trim(body.communityUrl,  MAX_URL);
  const category      = trim(body.category,      MAX_CAT);
  const raidLink      = trim(body.raidLink,      MAX_URL);
  const message       = trim(body.message,       MAX_MSG);
  const communitySize = Number(body.communitySize);
  const bannerMime    = String(body.bannerMime || '');
  const bannerB64     = typeof body.bannerB64 === 'string' ? body.bannerB64 : '';

  if (!communityName)                        return bad(res, 400, 'missing_name');
  if (!raidLink || !isXUrl(raidLink))        return bad(res, 400, 'invalid_raid_link', { hint: 'Must be an x.com / twitter.com URL.' });
  if (communityUrl && !isUrl(communityUrl))  return bad(res, 400, 'invalid_community_url');

  if (!ALLOWED_MIME.has(bannerMime))         return bad(res, 400, 'banner_unsupported_mime');
  if (!bannerB64)                            return bad(res, 400, 'banner_required');
  let bannerBuf;
  try { bannerBuf = Buffer.from(bannerB64, 'base64'); }
  catch { return bad(res, 400, 'banner_invalid_base64'); }
  if (bannerBuf.length === 0)                return bad(res, 400, 'banner_empty');
  if (bannerBuf.length > MAX_BANNER_BYTES)   return bad(res, 413, 'banner_too_large', { limit: MAX_BANNER_BYTES });

  const existing = one(await sql`
    SELECT id, status FROM collab_applications
     WHERE user_id = ${user.id} AND status IN ('pending', 'approved')
     ORDER BY id DESC LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_applied', { status: existing.status, id: existing.id });

  const row = one(await sql`
    INSERT INTO collab_applications
      (user_id, community_name, community_url, community_size, category,
       raid_link, raid_platform, message, status,
       banner_data, banner_mime, banner_bytes)
    VALUES
      (${user.id}, ${communityName}, ${communityUrl || null},
       ${Number.isFinite(communitySize) && communitySize >= 0 ? Math.trunc(communitySize) : null},
       ${category || null}, ${raidLink}, 'x', ${message || null}, 'pending',
       ${bannerBuf}, ${bannerMime}, ${bannerBuf.length})
    RETURNING id, created_at
  `);

  ok(res, { id: row.id, status: 'pending', createdAt: row.created_at });
}

function trim(v, max) {
  return typeof v === 'string' ? v.slice(0, max).trim() : '';
}
function isUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}
function isXUrl(s) {
  try {
    const u = new URL(s);
    return X_HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
}
