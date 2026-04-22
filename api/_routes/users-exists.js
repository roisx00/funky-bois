// Public endpoint: does this @handle have a THE 1969 account?
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

export default async function handler(req, res) {
  const username = normalizeXHandle(req.query?.username || '');
  if (!username) return bad(res, 400, 'missing_username');
  const row = one(await sql`SELECT 1 AS exists FROM users WHERE LOWER(x_username) = ${username} LIMIT 1`);
  ok(res, { username, exists: !!row });
}
