// Submit the giveaway / announcement post URL.
//
// Body: { url }
// Auth: cookie (must be the application owner).
//
// Gates:
//   1. Owner has an APPROVED application.
//   2. URL is a valid X post (x.com / twitter.com).
//   3. Once submitted, wallet collection unlocks. Resubmitting
//      replaces the URL (e.g. they want to swap to a better post).
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'collab_giveaway', max: 10, windowSecs: 3600 }))) return;

  const { url } = (await readBody(req)) || {};
  const u = typeof url === 'string' ? url.trim().slice(0, 300) : '';
  if (!u || !isXPostUrl(u)) {
    return bad(res, 400, 'invalid_url', { hint: 'Must be an x.com / twitter.com post URL.' });
  }

  const app = one(await sql`
    SELECT id, status FROM collab_applications
     WHERE user_id = ${user.id}
     ORDER BY id DESC LIMIT 1
  `);
  if (!app)                       return bad(res, 404, 'no_application');
  if (app.status !== 'approved')  return bad(res, 403, 'not_approved');

  await sql`
    UPDATE collab_applications
       SET giveaway_post_url = ${u},
           giveaway_submitted_at = now(),
           updated_at = now()
     WHERE id = ${app.id}
  `;

  return ok(res, { url: u });
}

function isXPostUrl(s) {
  try {
    const x = new URL(s);
    if (!X_HOSTS.has(x.hostname.toLowerCase())) return false;
    // Loose path check: should look like /handle/status/id at minimum.
    return /\/[^/]+\/(?:status|statuses)\/\d+/.test(x.pathname) || /\/[^/]+\/?$/.test(x.pathname);
  } catch { return false; }
}
