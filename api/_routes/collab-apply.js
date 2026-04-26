// User-initiated collaboration application.
//
// Body: {
//   communityName, communityUrl, communitySize, category,
//   raidLink, raidPlatform, message
// }
// Auth: cookie (X-authed, non-suspended).
//
// Rules:
//   1. One ACTIVE application per user (status pending OR approved).
//      Rejected = can re-apply.
//   2. raidLink required + must be a URL.
//   3. raidPlatform must be one of x | telegram | discord.
//   4. Caps on text fields to keep DB rows small.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALLOWED_PLATFORMS = new Set(['x', 'telegram', 'discord']);
const MAX_NAME    = 100;
const MAX_URL     = 300;
const MAX_MSG     = 500;
const MAX_CAT     = 50;

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
  const raidPlatform  = String(body.raidPlatform || '').toLowerCase();
  const message       = trim(body.message,       MAX_MSG);
  const communitySize = Number(body.communitySize);

  if (!communityName)                        return bad(res, 400, 'missing_name');
  if (!raidLink || !isUrl(raidLink))         return bad(res, 400, 'invalid_raid_link');
  if (!ALLOWED_PLATFORMS.has(raidPlatform))  return bad(res, 400, 'invalid_platform');
  if (communityUrl && !isUrl(communityUrl))  return bad(res, 400, 'invalid_community_url');

  // One active application per user.
  const existing = one(await sql`
    SELECT id, status FROM collab_applications
     WHERE user_id = ${user.id} AND status IN ('pending', 'approved')
     ORDER BY id DESC LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_applied', { status: existing.status, id: existing.id });

  const row = one(await sql`
    INSERT INTO collab_applications
      (user_id, community_name, community_url, community_size, category,
       raid_link, raid_platform, message, status)
    VALUES
      (${user.id}, ${communityName}, ${communityUrl || null},
       ${Number.isFinite(communitySize) && communitySize >= 0 ? Math.trunc(communitySize) : null},
       ${category || null}, ${raidLink}, ${raidPlatform}, ${message || null}, 'pending')
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
