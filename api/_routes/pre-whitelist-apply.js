// Submit (or re-submit) a pre-whitelist application for the drop pool.
//
// Drops are no longer first-come-first-served. A user must apply,
// admin reviews their X profile, and only after approval can they
// claim. This route just records the application.
//
// Re-application: if the user has a previous 'rejected' record,
// re-applying flips it back to 'pending'. Approved users can't
// re-apply (no point — they already have access).
//
// Anti-bot: relies on (a) X OAuth (real account) (b) >=20 followers
// (c) admin manual review of the X profile. No automated proof.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  // Soft per-user rate limit so someone can't spam the queue.
  if (!(await rateLimit(res, user.id, { name: 'prewl_apply', max: 3, windowSecs: 3600 }))) return;

  // Follower gate removed. The whole point of this route is to let
  // admins eyeball the X profile manually — they can use the follower
  // count as one signal among many in the queue.

  // Already approved? Tell them so the UI can skip the apply step.
  if (user.drop_eligible === true) {
    return ok(res, { status: 'approved', alreadyApproved: true });
  }

  // Already built a portrait? Drop access has nothing to give them.
  const built = one(await sql`
    SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1
  `);
  if (built) return bad(res, 409, 'already_built_portrait');

  const { message } = await readBody(req) || {};
  const trimmedMsg = (typeof message === 'string' ? message : '').slice(0, 240).trim();
  const profileUrl = `https://x.com/${user.x_username}`;

  // Upsert the application. UNIQUE (user_id) means a user has at most
  // one row at a time. Re-applying after rejection resets to pending.
  const row = one(await sql`
    INSERT INTO pre_whitelist_requests
      (user_id, x_username, x_followers, x_profile_url, message, status)
    VALUES
      (${user.id}, ${user.x_username}, ${user.x_followers || 0},
       ${profileUrl}, ${trimmedMsg || null}, 'pending')
    ON CONFLICT (user_id) DO UPDATE SET
      status        = CASE
                        WHEN pre_whitelist_requests.status = 'approved' THEN 'approved'
                        ELSE 'pending'
                      END,
      message       = COALESCE(EXCLUDED.message, pre_whitelist_requests.message),
      x_followers   = EXCLUDED.x_followers,
      x_profile_url = EXCLUDED.x_profile_url,
      updated_at    = now()
    RETURNING id, status, created_at, updated_at
  `);

  ok(res, {
    id:        row.id,
    status:    row.status,        // 'pending' | 'approved'
    submitted: row.status === 'pending',
  });
}
