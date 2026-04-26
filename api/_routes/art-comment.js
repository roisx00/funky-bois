// Comment on an approved art submission. Returns the new comment +
// the freshest 50 comments on that submission (so the client can
// drop them straight in without a separate refetch).
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return list(req, res);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'art_comment', max: 30, windowSecs: 300 }))) return;

  const { submissionId, body } = (await readBody(req)) || {};
  const sid = Number(submissionId);
  if (!Number.isInteger(sid) || sid <= 0) return bad(res, 400, 'invalid_submission');
  const text = typeof body === 'string' ? body.slice(0, 500).trim() : '';
  if (!text) return bad(res, 400, 'empty_comment');

  const sub = one(await sql`SELECT id, status FROM art_submissions WHERE id = ${sid} LIMIT 1`);
  if (!sub) return bad(res, 404, 'submission_not_found');
  if (sub.status !== 'approved') return bad(res, 409, 'not_commentable');

  const row = one(await sql`
    INSERT INTO art_comments (submission_id, user_id, body)
    VALUES (${sid}, ${user.id}, ${text})
    RETURNING id, created_at
  `);

  return list(req, res, sid, { id: row.id, body: text, createdAt: row.created_at });
}

async function list(req, res, sidOverride = null, justPosted = null) {
  const sid = Number(sidOverride ?? req.query?.submissionId);
  if (!Number.isInteger(sid) || sid <= 0) return bad(res, 400, 'invalid_submission');

  const rows = await sql`
    SELECT c.id, c.body, c.created_at,
           u.x_username, u.x_avatar
      FROM art_comments c
      JOIN users u ON u.id = c.user_id
     WHERE c.submission_id = ${sid}
     ORDER BY c.id DESC
     LIMIT 50
  `;

  return ok(res, {
    submissionId: sid,
    justPosted,
    comments: rows.map((r) => ({
      id:        r.id,
      body:      r.body,
      createdAt: new Date(r.created_at).getTime(),
      xUsername: r.x_username,
      xAvatar:   r.x_avatar,
    })),
  });
}
