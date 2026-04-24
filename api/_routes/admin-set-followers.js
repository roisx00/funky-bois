// Admin-only: override a user's X follower count. Used to seed
// demo accounts before their owner signs in (x-token.js auto-refreshes
// the real count on every sign-in anyway).
//
// Body: { xUsername, followers }
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { xUsername, followers } = (await readBody(req)) || {};
  const clean = normalizeXHandle(xUsername);
  const n = Number(followers);
  if (!clean) return bad(res, 400, 'missing_username');
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000_000) return bad(res, 400, 'invalid_followers');

  const row = one(await sql`
    UPDATE users SET x_followers = ${Math.trunc(n)}
     WHERE LOWER(x_username) = ${clean}
     RETURNING x_username, x_followers
  `);
  if (!row) return bad(res, 404, 'user_not_found');
  ok(res, { xUsername: row.x_username, xFollowers: row.x_followers });
}
